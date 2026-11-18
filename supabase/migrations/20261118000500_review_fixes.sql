-- Correcciones de la revisión de seguridad/consistencia

-- 1. Reabrir y volver a confirmar una solicitud no debe chocar con la reserva cancelada anterior
create or replace function public.confirm_booking_request(p_request_id uuid, p_notes text default '')
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  req public.booking_requests;
  res_id uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select * into req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  if req.status <> 'pending' then
    raise exception 'La solicitud ya fue gestionada (%).', req.status using errcode = 'P0001', hint = 'NOT_PENDING';
  end if;
  update public.reservations set request_id = null where request_id = req.id and status = 'cancelled';
  insert into public.reservations (room_id, request_id, guest_name, phone, check_in, check_out, guests, status, source, notes, created_by)
  values (req.room_id, req.id, req.guest_name, req.phone, req.check_in, req.check_out, req.guests, 'confirmed', 'request',
          coalesce(p_notes, ''), auth.uid())
  returning id into res_id;
  update public.booking_requests
     set status = 'confirmed', reservation_id = res_id, handled_by = auth.uid(), handled_at = now(),
         admin_notes = case when coalesce(p_notes, '') = '' then admin_notes else p_notes end
   where id = req.id;
  return res_id;
end $$;

-- 2. Condición de carrera al degradar administradores: serializa la comprobación
create or replace function public.guard_profiles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
      raise exception 'No puedes cambiar tu propio rol o estado.' using errcode = 'P0001', hint = 'SELF_ROLE';
    end if;
    new.email := old.email;
  end if;
  if (tg_op = 'DELETE' and old.role = 'admin' and old.active)
     or (tg_op = 'UPDATE' and old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)) then
    perform pg_advisory_xact_lock(hashtext('bambu.last_admin'));
    if not exists (select 1 from public.profiles
                   where role = 'admin' and active and id <> old.id) then
      raise exception 'Debe existir al menos un administrador activo.' using errcode = 'P0001', hint = 'LAST_ADMIN';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- 3. Rangos ocupados solo de habitaciones visibles al público
create or replace function public.room_busy_ranges(p_room_id uuid, p_from date, p_to date)
returns table (start_date date, end_date date)
language sql stable security definer set search_path = '' as $$
  select r.check_in, r.check_out from public.reservations r
   where r.room_id = p_room_id and r.status in ('confirmed', 'checked_in')
     and r.check_out > p_from and r.check_in < p_to
     and exists (select 1 from public.rooms x where x.id = p_room_id and x.publish_status = 'published' and x.operational_status <> 'inactive')
  union all
  select b.start_date, b.end_date + 1 from public.room_blocks b
   where b.room_id = p_room_id and b.active
     and b.end_date >= p_from and b.start_date < p_to
     and exists (select 1 from public.rooms x where x.id = p_room_id and x.publish_status = 'published' and x.operational_status <> 'inactive')
  order by 1
$$;

-- 4. Los visitantes solo ven imágenes que están en uso en contenido publicado
create or replace view public.public_media with (security_barrier = true) as
select m.id, m.source, m.path, m.thumb_path, m.width, m.height, m.alt_text, m.is_concept
from public.media_assets m
where exists (select 1 from public.rooms r where r.publish_status = 'published' and r.operational_status <> 'inactive'
                and (r.cover_media_id = m.id or exists (select 1 from public.room_images ri where ri.room_id = r.id and ri.media_id = m.id)))
   or exists (select 1 from public.gallery_items g where g.published and g.media_id = m.id)
   or exists (select 1 from public.posts p where p.status = 'published' and p.deleted_at is null and p.cover_media_id = m.id)
   or exists (select 1 from public.hotel_settings s where s.logo_media_id = m.id)
   or exists (select 1 from public.site_content c where c.value::text like '%' || m.id::text || '%');

-- 5. Al cancelar una reserva vinculada, la solicitud refleja el cambio
create or replace function public.sync_request_on_reservation_cancel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.request_id is not null then
    update public.booking_requests set status = 'cancelled', handled_by = auth.uid(), handled_at = now()
     where id = new.request_id and status = 'confirmed';
  end if;
  return null;
end $$;
revoke execute on function public.sync_request_on_reservation_cancel() from public, anon, authenticated;
create trigger reservations_sync_request after update of status on public.reservations
  for each row execute function public.sync_request_on_reservation_cancel();

-- 6. Storage: solo se borran archivos de uploads/ que ya no tienen registro (sin referencias rotas)
drop policy if exists media_staff_update on storage.objects;
drop policy if exists media_staff_delete on storage.objects;
create policy media_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_staff())
         and (storage.foldername(name))[1] = 'uploads'
         and not exists (select 1 from public.media_assets m where m.path = name or m.thumb_path = name));
