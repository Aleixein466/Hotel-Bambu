-- Hotel Bambú Plaza · reglas de negocio, auditoría y revisiones públicas

-- ---------------------------------------------------------------------------
-- Protección de perfiles: nadie cambia su propio rol y siempre queda un admin activo
-- ---------------------------------------------------------------------------
create or replace function public.guard_profiles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
      raise exception 'No puedes cambiar tu propio rol o estado.' using errcode = 'P0001', hint = 'SELF_ROLE';
    end if;
    new.email := old.email; -- el correo se gestiona en Auth
  end if;
  if (tg_op = 'DELETE' and old.role = 'admin' and old.active)
     or (tg_op = 'UPDATE' and old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)) then
    if not exists (select 1 from public.profiles
                   where role = 'admin' and active and id <> old.id) then
      raise exception 'Debe existir al menos un administrador activo.' using errcode = 'P0001', hint = 'LAST_ADMIN';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger profiles_guard before update or delete on public.profiles
  for each row execute function public.guard_profiles();

-- Los editores no pueden desactivar ni reactivar habitaciones
create or replace function public.guard_rooms() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not public.is_admin() and (
       (tg_op = 'UPDATE' and (new.operational_status = 'inactive') is distinct from (old.operational_status = 'inactive'))
       or (tg_op = 'UPDATE' and new.number is distinct from old.number)) then
    raise exception 'Solo un administrador puede desactivar habitaciones o cambiar su número.'
      using errcode = 'P0001', hint = 'ADMIN_ONLY';
  end if;
  return new;
end $$;
create trigger rooms_guard before update on public.rooms
  for each row when (auth.uid() is not null) execute function public.guard_rooms();

-- ---------------------------------------------------------------------------
-- Disponibilidad: reservas activas vs bloqueos (bloqueo por habitación para concurrencia)
-- ---------------------------------------------------------------------------
create or replace function public.guard_reservation_availability() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  turnover boolean;
begin
  if new.status not in ('confirmed', 'checked_in') then
    return new;
  end if;
  -- Serializa operaciones concurrentes sobre la misma habitación
  perform 1 from public.rooms where id = new.room_id for update;

  if exists (select 1 from public.room_blocks b
             where b.room_id = new.room_id and b.active
               and daterange(b.start_date, b.end_date, '[]') && daterange(new.check_in, new.check_out, '[)')) then
    raise exception 'La habitación tiene un bloqueo en esas fechas.' using errcode = 'P0001', hint = 'ROOM_BLOCKED';
  end if;

  select allow_same_day_turnover into turnover from public.hotel_settings where id = 1;
  if not coalesce(turnover, true) and exists (
      select 1 from public.reservations r
      where r.room_id = new.room_id and r.id <> new.id and r.status in ('confirmed', 'checked_in')
        and daterange(r.check_in, r.check_out, '[]') && daterange(new.check_in, new.check_out, '[]')) then
    raise exception 'La habitación no admite entrada el mismo día de otra salida.' using errcode = 'P0001', hint = 'NO_TURNOVER';
  end if;
  return new;
end $$;
create trigger reservations_availability before insert or update on public.reservations
  for each row execute function public.guard_reservation_availability();

create or replace function public.guard_block_availability() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.active then
    return new;
  end if;
  perform 1 from public.rooms where id = new.room_id for update;
  if exists (select 1 from public.reservations r
             where r.room_id = new.room_id and r.status in ('confirmed', 'checked_in')
               and daterange(r.check_in, r.check_out, '[)') && daterange(new.start_date, new.end_date, '[]')) then
    raise exception 'Hay reservas confirmadas en esas fechas. Cancélalas o muévelas antes de bloquear.'
      using errcode = 'P0001', hint = 'RESERVATION_CONFLICT';
  end if;
  return new;
end $$;
create trigger room_blocks_availability before insert or update on public.room_blocks
  for each row execute function public.guard_block_availability();

-- ---------------------------------------------------------------------------
-- Auditoría genérica. Para tablas con datos personales solo se guardan ids y estados.
-- ---------------------------------------------------------------------------
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  redact boolean := coalesce(tg_argv[0], '') = 'redact';
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  diff jsonb;
  k text;
begin
  if tg_op = 'UPDATE' then
    diff := '{}';
    for k in select jsonb_object_keys(new_j) loop
      if k not in ('updated_at', 'updated_by') and (old_j -> k) is distinct from (new_j -> k) then
        diff := diff || jsonb_build_object(k, case when redact and k not in ('status', 'room_id', 'check_in', 'check_out', 'active', 'role')
                                                   then to_jsonb('[oculto]'::text) else new_j -> k end);
      end if;
    end loop;
    if diff = '{}' then return new; end if;
  elsif redact then
    diff := jsonb_strip_nulls(jsonb_build_object(
      'status', coalesce(new_j, old_j) -> 'status', 'room_id', coalesce(new_j, old_j) -> 'room_id',
      'check_in', coalesce(new_j, old_j) -> 'check_in', 'check_out', coalesce(new_j, old_j) -> 'check_out'));
  else
    diff := coalesce(new_j, old_j) - 'draft';
  end if;

  insert into public.audit_logs (actor_id, actor_email, action, entity, entity_id, changes)
  values (auth.uid(), auth.jwt() ->> 'email', lower(tg_op), tg_table_name,
          coalesce(new_j, old_j) ->> coalesce(nullif(tg_argv[1], ''), 'id'), diff);
  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array['media_assets','amenities','rooms','room_images','gallery_items','posts','hotel_settings','profiles']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.audit_row()', t || '_audit', t);
  end loop;
  foreach t in array array['booking_requests','reservations','room_blocks']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function public.audit_row(''redact'')', t || '_audit', t);
  end loop;
end $$;
create trigger site_content_audit after insert or update or delete on public.site_content
  for each row execute function public.audit_row('', 'key');
create trigger room_amenities_audit after insert or delete on public.room_amenities
  for each row execute function public.audit_row('', 'room_id');

-- ---------------------------------------------------------------------------
-- Revisiones públicas (para invalidación de caché en tiempo real)
-- ---------------------------------------------------------------------------
create or replace function public.bump_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.public_revisions (scope, rev, updated_at) values (tg_argv[0], 1, now())
  on conflict (scope) do update set rev = public.public_revisions.rev + 1, updated_at = now();
  return null;
end $$;

do $$
declare pair text[];
begin
  foreach pair slice 1 in array array[
    array['rooms','rooms'], array['room_images','rooms'], array['room_amenities','rooms'], array['amenities','rooms'],
    array['media_assets','media'], array['gallery_items','gallery'], array['posts','posts'],
    array['site_content','content'], array['hotel_settings','settings'],
    array['reservations','availability'], array['room_blocks','availability']]
  loop
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each statement execute function public.bump_revision(%L)',
                   pair[1] || '_bump_revision', pair[1], pair[2]);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Publicación de borradores (security invoker: se aplican las políticas RLS)
-- ---------------------------------------------------------------------------
create or replace function public.publish_room(p_room_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  d jsonb;
begin
  if not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select draft into d from public.rooms where id = p_room_id for update;
  if not found then
    raise exception 'Habitación no encontrada' using errcode = 'P0002';
  end if;
  d := coalesce(d, '{}');
  update public.rooms r set
    name = coalesce(d ->> 'name', r.name),
    room_type = coalesce(d ->> 'room_type', r.room_type),
    description = coalesce(d ->> 'description', r.description),
    capacity = coalesce((d ->> 'capacity')::int, r.capacity),
    price_cop = case when d ? 'price_cop' then (d ->> 'price_cop')::int else r.price_cop end,
    cover_media_id = case when d ? 'cover_media_id' then (d ->> 'cover_media_id')::uuid else r.cover_media_id end,
    details_confirmed = coalesce((d ->> 'details_confirmed')::boolean, r.details_confirmed),
    publish_status = 'published',
    published_at = now(),
    draft = null,
    draft_updated_at = null
  where r.id = p_room_id;

  if d ? 'amenity_ids' then
    delete from public.room_amenities where room_id = p_room_id
      and amenity_id not in (select (jsonb_array_elements_text(d -> 'amenity_ids'))::uuid);
    insert into public.room_amenities (room_id, amenity_id)
      select p_room_id, (x)::uuid from jsonb_array_elements_text(d -> 'amenity_ids') x
      on conflict do nothing;
  end if;
end $$;

create or replace function public.publish_post(p_post_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  d jsonb;
begin
  if not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select draft into d from public.posts where id = p_post_id and deleted_at is null for update;
  if not found then
    raise exception 'Publicación no encontrada' using errcode = 'P0002';
  end if;
  d := coalesce(d, '{}');
  update public.posts p set
    title = coalesce(d ->> 'title', p.title),
    slug = coalesce(d ->> 'slug', p.slug),
    kind = coalesce(d ->> 'kind', p.kind),
    excerpt = coalesce(d ->> 'excerpt', p.excerpt),
    body = coalesce(d ->> 'body', p.body),
    cover_media_id = case when d ? 'cover_media_id' then (d ->> 'cover_media_id')::uuid else p.cover_media_id end,
    starts_at = case when d ? 'starts_at' then (d ->> 'starts_at')::timestamptz else p.starts_at end,
    ends_at = case when d ? 'ends_at' then (d ->> 'ends_at')::timestamptz else p.ends_at end,
    status = 'published',
    published_at = coalesce(p.published_at, now()),
    draft = null,
    draft_updated_at = null
  where p.id = p_post_id;
end $$;

create or replace function public.publish_content(p_key text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.site_content
     set value = coalesce(draft, value), draft = null, draft_updated_at = null, published_at = now()
   where key = p_key;
  if not found then
    raise exception 'Contenido no encontrado' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Multimedia: uso y borrado seguro (sin referencias rotas)
-- ---------------------------------------------------------------------------
create or replace view public.media_usage with (security_invoker = true) as
select m.id as media_id,
       (select count(*) from public.rooms r where r.cover_media_id = m.id or r.draft ->> 'cover_media_id' = m.id::text)
     + (select count(*) from public.room_images ri where ri.media_id = m.id)
     + (select count(*) from public.gallery_items g where g.media_id = m.id)
     + (select count(*) from public.posts p where p.cover_media_id = m.id or p.draft ->> 'cover_media_id' = m.id::text)
     + (select count(*) from public.hotel_settings s where s.logo_media_id = m.id)
     + (select count(*) from public.site_content c where c.value::text like '%' || m.id::text || '%'
                                                     or coalesce(c.draft::text, '') like '%' || m.id::text || '%')
       as usage_count
from public.media_assets m;

create or replace function public.delete_media(p_media_id uuid)
returns table (source text, path text, thumb_path text)
language plpgsql security invoker set search_path = '' as $$
declare
  used bigint;
begin
  if not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select u.usage_count into used from public.media_usage u where u.media_id = p_media_id;
  if used is null then
    raise exception 'Archivo no encontrado' using errcode = 'P0002';
  end if;
  if used > 0 then
    raise exception 'La imagen está en uso (% referencias). Quítala primero de habitaciones, galería, portada o publicaciones.', used
      using errcode = 'P0001', hint = 'MEDIA_IN_USE';
  end if;
  return query delete from public.media_assets m where m.id = p_media_id
    returning m.source, m.path, m.thumb_path;
end $$;

-- Archivos del bucket sin registro en media_assets (huérfanos)
create or replace function public.orphan_storage_objects()
returns table (name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select o.name, o.created_at
  from storage.objects o
  where public.is_staff()
    and o.bucket_id = 'media'
    and o.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.media_assets m
                    where m.source = 'storage' and (m.path = o.name or m.thumb_path = o.name))
  order by o.created_at
$$;

-- ---------------------------------------------------------------------------
-- Solicitudes públicas
-- ---------------------------------------------------------------------------
create or replace function private.rate_limit_hit(p_bucket text, p_key text, p_max int, p_window interval)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  h text;
  n int;
begin
  select md5((select value from private.config where key = 'rate_limit_salt') || p_key) into h;
  delete from private.request_rate_limits where created_at < now() - interval '2 days';
  select count(*) into n from private.request_rate_limits
   where bucket = p_bucket and key_hash = h and created_at > now() - p_window;
  if n >= p_max then
    return true;
  end if;
  insert into private.request_rate_limits (bucket, key_hash) values (p_bucket, h);
  return false;
end $$;

create or replace function public.room_busy_ranges(p_room_id uuid, p_from date, p_to date)
returns table (start_date date, end_date date)
language sql stable security definer set search_path = '' as $$
  -- end_date exclusivo. Sin datos personales.
  select r.check_in, r.check_out from public.reservations r
   where r.room_id = p_room_id and r.status in ('confirmed', 'checked_in')
     and r.check_out > p_from and r.check_in < p_to
  union all
  select b.start_date, b.end_date + 1 from public.room_blocks b
   where b.room_id = p_room_id and b.active
     and b.end_date >= p_from and b.start_date < p_to
  order by 1
$$;

create or replace function public.submit_booking_request(
  p_room_id uuid, p_check_in date, p_check_out date, p_guests int,
  p_guest_name text, p_phone text, p_consent boolean, p_website text default ''
) returns table (id uuid, code text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  rm public.rooms;
  clean_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  clean_name text := btrim(regexp_replace(coalesce(p_guest_name, ''), '[\s]+', ' ', 'g'));
  hdrs json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  -- No se usa la primera IP de x-forwarded-for: el cliente puede falsificarla.
  ip text := coalesce(hdrs ->> 'cf-connecting-ip', hdrs ->> 'x-real-ip',
                      btrim((regexp_split_to_array(coalesce(hdrs ->> 'x-forwarded-for', 'unknown'), ','))[
                        array_length(regexp_split_to_array(coalesce(hdrs ->> 'x-forwarded-for', 'unknown'), ','), 1)]));
  new_code text;
  new_id uuid;
begin
  if coalesce(p_website, '') <> '' then
    raise exception 'Solicitud rechazada.' using errcode = 'P0001', hint = 'SPAM';
  end if;
  if not coalesce(p_consent, false) then
    raise exception 'Debes aceptar el tratamiento de datos.' using errcode = 'P0001', hint = 'CONSENT';
  end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 120 or clean_name ~ '[<>{}]' then
    raise exception 'Ingresa un nombre válido.' using errcode = 'P0001', hint = 'NAME';
  end if;
  if clean_phone !~ '^[0-9]{7,15}$' then
    raise exception 'Ingresa un teléfono válido (7 a 15 dígitos).' using errcode = 'P0001', hint = 'PHONE';
  end if;
  if p_check_in is null or p_check_out is null or p_check_in < public.hotel_today() then
    raise exception 'La fecha de entrada no puede estar en el pasado.' using errcode = 'P0001', hint = 'DATES';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'La salida debe ser posterior a la entrada.' using errcode = 'P0001', hint = 'DATES';
  end if;
  if p_check_out - p_check_in > 30 or p_check_in > public.hotel_today() + 540 then
    raise exception 'Para estadías de más de 30 noches o con más de 18 meses de anticipación, contáctanos directamente.'
      using errcode = 'P0001', hint = 'DATES';
  end if;

  select * into rm from public.rooms r where r.id = p_room_id;
  if not found or rm.publish_status <> 'published' or rm.operational_status <> 'available' then
    raise exception 'Esta habitación no está disponible para solicitudes.' using errcode = 'P0001', hint = 'ROOM';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > rm.capacity then
    raise exception 'La habitación admite máximo % huésped(es).', rm.capacity using errcode = 'P0001', hint = 'CAPACITY';
  end if;
  if exists (select 1 from public.room_busy_ranges(p_room_id, p_check_in, p_check_out) b
             where daterange(b.start_date, b.end_date, '[)') && daterange(p_check_in, p_check_out, '[)')) then
    raise exception 'La habitación no está disponible en esas fechas. Prueba otras fechas u otra habitación.'
      using errcode = 'P0001', hint = 'UNAVAILABLE';
  end if;

  if private.rate_limit_hit('ip', ip, 5, interval '1 hour')
     or private.rate_limit_hit('phone', clean_phone, 3, interval '1 day')
     or private.rate_limit_hit('global', 'all', 120, interval '1 hour') then
    raise exception 'Has enviado demasiadas solicitudes. Intenta más tarde o escríbenos por WhatsApp.'
      using errcode = 'P0001', hint = 'RATE_LIMIT';
  end if;

  loop
    new_code := 'BP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.booking_requests b where b.code = new_code);
  end loop;

  insert into public.booking_requests (code, room_id, check_in, check_out, guests, guest_name, phone, consent_at, consent_version)
  values (new_code, p_room_id, p_check_in, p_check_out, p_guests, clean_name, clean_phone, now(), '2026-11')
  returning booking_requests.id into new_id;

  return query select new_id, new_code;
end $$;

-- ---------------------------------------------------------------------------
-- Gestión de solicitudes (administrador)
-- ---------------------------------------------------------------------------
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

create or replace function public.set_booking_request_status(p_request_id uuid, p_status text, p_notes text default '')
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  req public.booking_requests;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_status not in ('rejected', 'cancelled', 'pending') then
    raise exception 'Estado no válido' using errcode = 'P0001', hint = 'STATUS';
  end if;
  select * into req from public.booking_requests where id = p_request_id for update;
  if not found then
    raise exception 'Solicitud no encontrada' using errcode = 'P0002';
  end if;
  if req.status = 'confirmed' and p_status <> 'cancelled' then
    raise exception 'Una solicitud confirmada solo puede cancelarse.' using errcode = 'P0001', hint = 'STATUS';
  end if;
  if req.status = 'confirmed' and req.reservation_id is not null then
    update public.reservations set status = 'cancelled' where id = req.reservation_id;
  end if;
  update public.booking_requests
     set status = p_status, handled_by = auth.uid(), handled_at = now(),
         admin_notes = case when coalesce(p_notes, '') = '' then admin_notes else p_notes end
   where id = req.id;
end $$;

-- ---------------------------------------------------------------------------
-- Indicadores del panel (calculados, nunca inventados)
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  today date := public.hotel_today();
  result jsonb;
begin
  if not public.is_staff() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'today', today,
    'rooms_total', (select count(*) from public.rooms where operational_status <> 'inactive'),
    'rooms_inactive', (select count(*) from public.rooms where operational_status = 'inactive'),
    'rooms_published', (select count(*) from public.rooms where publish_status = 'published' and operational_status <> 'inactive'),
    'rooms_maintenance', (select count(*) from public.rooms where operational_status = 'maintenance'),
    'rooms_with_draft', (select count(*) from public.rooms where draft is not null),
    'posts_active', (select count(*) from public.posts where status = 'published' and deleted_at is null
                                                     and (ends_at is null or ends_at > now())),
    'posts_draft', (select count(*) from public.posts where status <> 'published' and deleted_at is null),
    'is_admin', public.is_admin()
  ) into result;

  if public.is_admin() then
    result := result || jsonb_build_object(
      'rooms_occupied', (select count(distinct r.room_id) from public.reservations r
                          where r.status in ('confirmed', 'checked_in') and r.check_in <= today and r.check_out > today),
      'rooms_blocked_today', (select count(distinct b.room_id) from public.room_blocks b
                          where b.active and b.start_date <= today and b.end_date >= today),
      'requests_pending', (select count(*) from public.booking_requests where status = 'pending'),
      'reservations_upcoming', (select count(*) from public.reservations
                                 where status in ('confirmed', 'checked_in') and check_out > today),
      'arrivals_7d', (select count(*) from public.reservations
                       where status = 'confirmed' and check_in between today and today + 7),
      'departures_7d', (select count(*) from public.reservations
                         where status in ('confirmed', 'checked_in') and check_out between today and today + 7)
    );
  end if;
  return result;
end $$;
