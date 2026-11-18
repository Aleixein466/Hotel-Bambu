-- Hotel Bambú Plaza · RLS, permisos, vistas públicas y almacenamiento
--
-- Modelo:
--   anon / visitantes: solo leen vistas public_* (contenido publicado) y llaman
--                      submit_booking_request / room_busy_ranges. Nunca tocan tablas base.
--   editor:            contenido (habitaciones, imágenes, galería, publicaciones, textos).
--   admin:             todo lo anterior + solicitudes, reservas, bloqueos, configuración,
--                      usuarios y auditoría.

-- ---------------------------------------------------------------------------
-- RLS en todas las tablas y retiro de privilegios por defecto a anon
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','media_assets','amenities','rooms','room_amenities','room_images',
                           'gallery_items','site_content','posts','hotel_settings','booking_requests',
                           'reservations','room_blocks','audit_logs','public_revisions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

revoke all on all tables in schema private from anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- Funciones: nada ejecutable por defecto; se concede explícitamente.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_staff(), public.is_admin(), public.current_staff_role(), public.hotel_today()
  to anon, authenticated;
grant execute on function public.submit_booking_request(uuid, date, date, int, text, text, boolean, text) to anon, authenticated;
grant execute on function public.room_busy_ranges(uuid, date, date) to anon, authenticated;
grant execute on function public.publish_room(uuid), public.publish_post(uuid), public.publish_content(text),
  public.delete_media(uuid), public.orphan_storage_objects(), public.dashboard_stats(),
  public.confirm_booking_request(uuid, text), public.set_booking_request_status(uuid, text, text)
  to authenticated;
-- Funciones de triggers: las invoca el motor, no la API
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- Políticas
-- ---------------------------------------------------------------------------
-- profiles
create policy profiles_select_self_or_admin on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy profiles_update_self_name on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete_admin on public.profiles for delete to authenticated
  using ((select public.is_admin()) and id <> (select auth.uid()));
-- Inserción de perfiles: solo con service_role (script create-admin o función invite-user).

-- Contenido editable por todo el personal
do $$
declare t text;
begin
  foreach t in array array['media_assets','amenities','room_amenities','room_images','gallery_items','site_content','posts']
  loop
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_staff()))', t || '_staff_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_staff()))', t || '_staff_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t || '_staff_update', t);
  end loop;
end $$;
-- Borrados físicos permitidos (las publicaciones usan borrado lógico; ver abajo)
create policy media_assets_staff_delete on public.media_assets for delete to authenticated using ((select public.is_staff()));
create policy room_amenities_staff_delete on public.room_amenities for delete to authenticated using ((select public.is_staff()));
create policy room_images_staff_delete on public.room_images for delete to authenticated using ((select public.is_staff()));
create policy gallery_items_staff_delete on public.gallery_items for delete to authenticated using ((select public.is_staff()));
create policy amenities_admin_delete on public.amenities for delete to authenticated using ((select public.is_admin()));
-- posts: borrado definitivo solo admin y solo si ya estaba en la papelera
create policy posts_admin_purge on public.posts for delete to authenticated
  using ((select public.is_admin()) and deleted_at is not null);

-- rooms: el personal edita; solo admin crea. Nunca se borran (historial de reservas).
create policy rooms_staff_select on public.rooms for select to authenticated using ((select public.is_staff()));
create policy rooms_staff_update on public.rooms for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy rooms_admin_insert on public.rooms for insert to authenticated with check ((select public.is_admin()));

-- hotel_settings: lectura personal, escritura admin
create policy settings_staff_select on public.hotel_settings for select to authenticated using ((select public.is_staff()));
create policy settings_admin_update on public.hotel_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Operación hotelera: solo admin (datos personales de huéspedes)
create policy booking_requests_admin_select on public.booking_requests for select to authenticated using ((select public.is_admin()));
create policy booking_requests_admin_update on public.booking_requests for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Inserción solo vía submit_booking_request (security definer). Sin borrado: se conserva el historial.

create policy reservations_admin_select on public.reservations for select to authenticated using ((select public.is_admin()));
create policy reservations_admin_insert on public.reservations for insert to authenticated with check ((select public.is_admin()));
create policy reservations_admin_update on public.reservations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy room_blocks_admin_select on public.room_blocks for select to authenticated using ((select public.is_admin()));
create policy room_blocks_admin_insert on public.room_blocks for insert to authenticated with check ((select public.is_admin()));
create policy room_blocks_admin_update on public.room_blocks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy audit_logs_admin_select on public.audit_logs for select to authenticated using ((select public.is_admin()));
revoke insert, update, delete, truncate on public.audit_logs from authenticated;

-- Revisiones: lectura pública (Realtime); escritura solo por triggers
create policy public_revisions_read on public.public_revisions for select to anon, authenticated using (true);
grant select on public.public_revisions to anon, authenticated;
revoke insert, update, delete, truncate on public.public_revisions from authenticated;

-- Columnas que el personal no debe escribir directamente
revoke insert, update, delete on public.booking_requests from authenticated;
grant update (status, admin_notes, reservation_id, handled_by, handled_at) on public.booking_requests to authenticated;
-- Las reservas no se borran: se cancelan
revoke delete on public.reservations, public.room_blocks, public.rooms from authenticated;

-- ---------------------------------------------------------------------------
-- Vistas públicas: solo contenido publicado y columnas seguras.
-- Se ejecutan con permisos del propietario (filtrado explícito en WHERE).
-- ---------------------------------------------------------------------------
create view public.public_media with (security_barrier = true) as
select id, source, path, thumb_path, width, height, alt_text, is_concept
from public.media_assets;

create view public.public_rooms with (security_barrier = true) as
select r.id, r.number, r.name, r.room_type, r.description, r.capacity, r.price_cop,
       r.details_confirmed, r.operational_status, r.sort_order,
       (select to_jsonb(m) from public.public_media m
         where m.id = coalesce(r.cover_media_id,
                               (select ri.media_id from public.room_images ri where ri.room_id = r.id
                                order by ri.sort_order, ri.created_at limit 1))) as cover,
       coalesce((select jsonb_agg(to_jsonb(m) order by ri.sort_order, ri.created_at)
                   from public.room_images ri join public.public_media m on m.id = ri.media_id
                  where ri.room_id = r.id), '[]'::jsonb) as images,
       coalesce((select jsonb_agg(a.name order by a.sort_order, a.name)
                   from public.room_amenities ra join public.amenities a on a.id = ra.amenity_id
                  where ra.room_id = r.id and a.active), '[]'::jsonb) as amenities
from public.rooms r
where r.publish_status = 'published' and r.operational_status <> 'inactive';

create view public.public_gallery with (security_barrier = true) as
select g.id, g.caption, g.category, g.sort_order, to_jsonb(m) as media
from public.gallery_items g join public.public_media m on m.id = g.media_id
where g.published;

create view public.public_posts with (security_barrier = true) as
select p.id, p.slug, p.kind, p.title, p.excerpt, p.body, p.starts_at, p.ends_at, p.published_at, p.sort_order,
       (select to_jsonb(m) from public.public_media m where m.id = p.cover_media_id) as cover
from public.posts p
where p.status = 'published' and p.deleted_at is null and (p.ends_at is null or p.ends_at > now());

create view public.public_site_content with (security_barrier = true) as
select key, value, published_at from public.site_content;

create view public.public_settings with (security_barrier = true) as
select s.hotel_name, s.whatsapp, s.phone, s.email, s.address, s.city, s.map_url, s.business_hours, s.social,
       s.booking_policy, s.check_in_time, s.check_out_time, s.updated_at,
       (select to_jsonb(m) from public.public_media m where m.id = s.logo_media_id) as logo
from public.hotel_settings s where s.id = 1;

do $$
declare v text;
begin
  foreach v in array array['public_media','public_rooms','public_gallery','public_posts','public_site_content','public_settings']
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to anon, authenticated', v);
  end loop;
end $$;
revoke all on public.media_usage from public, anon;
grant select on public.media_usage to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.public_revisions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: bucket público de lectura, escritura solo personal autorizado
-- Rutas inmutables (uuid por archivo) => reemplazar una foto genera una URL nueva, sin caché vieja.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy media_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'media' and (select public.is_staff()));
create policy media_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select public.is_staff())
              and (storage.foldername(name))[1] in ('uploads'));
create policy media_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select public.is_staff()));
create policy media_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select public.is_staff()));
