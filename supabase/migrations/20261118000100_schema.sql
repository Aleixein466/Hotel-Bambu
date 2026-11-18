-- Hotel Bambú Plaza · esquema base
-- Fuente única de verdad del sitio público y del panel administrativo.

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and auth.uid() is not null then
    begin
      new.updated_by := auth.uid();
    exception when undefined_column then null;
    end;
  end if;
  return new;
end $$;

create or replace function public.hotel_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- ---------------------------------------------------------------------------
-- Perfiles y roles (no hay registro público: los crea un administrador)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  role text not null check (role in ('admin', 'editor')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rol efectivo del usuario actual. Exige AAL2 si el usuario tiene MFA verificado.
create or replace function public.current_staff_role() returns text
language sql stable security definer set search_path = '' as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
    )
$$;

create or replace function public.is_staff() returns boolean
language sql stable set search_path = '' as $$
  select public.current_staff_role() is not null
$$;

create or replace function public.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select public.current_staff_role() = 'admin'
$$;

-- ---------------------------------------------------------------------------
-- Multimedia
-- ---------------------------------------------------------------------------
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('storage', 'bundled')),
  path text not null unique check (char_length(path) between 1 and 400),
  thumb_path text check (thumb_path is null or char_length(thumb_path) <= 400),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  width int check (width is null or width between 1 and 20000),
  height int check (height is null or height between 1 and 20000),
  size_bytes int check (size_bytes is null or size_bytes between 0 and 20971520),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  title text not null default '' check (char_length(title) <= 120),
  -- true = imagen ilustrativa/conceptual, nunca debe presentarse como foto real
  is_concept boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source <> 'bundled' or path like '/assets/%')
);

-- ---------------------------------------------------------------------------
-- Habitaciones
-- ---------------------------------------------------------------------------
create table public.amenities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (number ~ '^[A-Za-z0-9-]{1,10}$'),
  name text not null check (char_length(name) between 1 and 80),
  room_type text not null default 'Por confirmar' check (char_length(room_type) between 1 and 40),
  description text not null default '' check (char_length(description) <= 2000),
  capacity int not null check (capacity between 1 and 20),
  price_cop int check (price_cop is null or price_cop between 0 and 100000000),
  cover_media_id uuid references public.media_assets(id) on delete restrict,
  details_confirmed boolean not null default false,
  operational_status text not null default 'available'
    check (operational_status in ('available', 'maintenance', 'inactive')),
  publish_status text not null default 'draft'
    check (publish_status in ('draft', 'published', 'hidden')),
  sort_order int not null default 0,
  -- Cambios pendientes de publicar (campos editoriales). null = sin borrador.
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  draft_updated_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rooms_public_idx on public.rooms (publish_status, operational_status, sort_order);

create table public.room_amenities (
  room_id uuid not null references public.rooms(id) on delete cascade,
  amenity_id uuid not null references public.amenities(id) on delete cascade,
  primary key (room_id, amenity_id)
);
create index room_amenities_amenity_idx on public.room_amenities (amenity_id);

create table public.room_images (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  media_id uuid not null references public.media_assets(id) on delete restrict,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (room_id, media_id)
);
create index room_images_room_idx on public.room_images (room_id, sort_order);
create index room_images_media_idx on public.room_images (media_id);

-- ---------------------------------------------------------------------------
-- Galería, contenidos y publicaciones
-- ---------------------------------------------------------------------------
create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_assets(id) on delete restrict,
  caption text not null default '' check (char_length(caption) <= 160),
  category text not null default 'Espacios comunes' check (char_length(category) between 1 and 40),
  sort_order int not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index gallery_items_media_idx on public.gallery_items (media_id);

create table public.site_content (
  key text primary key check (key ~ '^[a-z0-9_.]{1,60}$'),
  value jsonb not null default '{}' check (jsonb_typeof(value) = 'object'),
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  draft_updated_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  kind text not null default 'news' check (kind in ('news', 'promotion', 'offer')),
  title text not null check (char_length(title) between 1 and 160),
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  body text not null default '' check (char_length(body) <= 20000),
  cover_media_id uuid references public.media_assets(id) on delete restrict,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  sort_order int not null default 0,
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  draft_updated_at timestamptz,
  published_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index posts_public_idx on public.posts (status, deleted_at, sort_order, published_at desc);
create index posts_cover_idx on public.posts (cover_media_id);

-- ---------------------------------------------------------------------------
-- Configuración general (fila única)
-- ---------------------------------------------------------------------------
create table public.hotel_settings (
  id smallint primary key default 1 check (id = 1),
  hotel_name text not null default 'Hotel Bambú Plaza' check (char_length(hotel_name) between 1 and 80),
  logo_media_id uuid references public.media_assets(id) on delete set null,
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
  phone text check (phone is null or char_length(phone) <= 30),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address text check (address is null or char_length(address) <= 200),
  city text not null default 'Mocoa, Putumayo, Colombia' check (char_length(city) <= 120),
  map_url text check (map_url is null or map_url ~* '^https://'),
  business_hours text check (business_hours is null or char_length(business_hours) <= 300),
  social jsonb not null default '{}' check (jsonb_typeof(social) = 'object'),
  booking_policy text check (booking_policy is null or char_length(booking_policy) <= 4000),
  check_in_time time,
  check_out_time time,
  allow_same_day_turnover boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Solicitudes, reservas y bloqueos
-- ---------------------------------------------------------------------------
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  room_id uuid not null references public.rooms(id) on delete restrict,
  check_in date not null,
  check_out date not null,
  guests int not null check (guests between 1 and 20),
  guest_name text not null check (char_length(guest_name) between 2 and 120),
  phone text not null check (phone ~ '^[0-9]{7,15}$'),
  consent_at timestamptz not null,
  consent_version text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'cancelled')),
  admin_notes text not null default '' check (char_length(admin_notes) <= 2000),
  reservation_id uuid,
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (check_out > check_in)
);
create index booking_requests_status_idx on public.booking_requests (status, created_at desc);
create index booking_requests_room_idx on public.booking_requests (room_id, check_in);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  request_id uuid unique references public.booking_requests(id) on delete set null,
  guest_name text not null check (char_length(guest_name) between 2 and 120),
  phone text check (phone is null or phone ~ '^[0-9]{7,15}$'),
  check_in date not null,
  check_out date not null,
  guests int not null check (guests between 1 and 20),
  status text not null default 'confirmed' check (status in ('confirmed', 'checked_in', 'checked_out', 'cancelled')),
  source text not null default 'manual' check (source in ('request', 'manual')),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  -- Garantía de base de datos: nunca dos reservas activas superpuestas en la misma habitación.
  -- Rango [entrada, salida): la salida de una puede coincidir con la entrada de otra.
  constraint reservations_no_overlap exclude using gist (
    room_id with =, daterange(check_in, check_out, '[)') with &&
  ) where (status in ('confirmed', 'checked_in'))
);
create index reservations_dates_idx on public.reservations (check_in, check_out);

alter table public.booking_requests
  add constraint booking_requests_reservation_fk
  foreign key (reservation_id) references public.reservations(id) on delete set null;

create table public.room_blocks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete restrict,
  start_date date not null,
  end_date date not null, -- inclusivo: último día bloqueado
  reason text not null default 'Mantenimiento' check (char_length(reason) between 1 and 200),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  constraint room_blocks_no_overlap exclude using gist (
    room_id with =, daterange(start_date, end_date, '[]') with &&
  ) where (active)
);

-- ---------------------------------------------------------------------------
-- Auditoría y revisiones públicas
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  entity text not null,
  entity_id text,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

-- Contador por ámbito. Los visitantes se suscriben por Realtime e invalidan su caché.
create table public.public_revisions (
  scope text primary key,
  rev bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Límite de solicitudes públicas (datos privados, no expuestos por la API)
create table private.request_rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index request_rate_limits_idx on private.request_rate_limits (bucket, key_hash, created_at);

create table private.config (
  key text primary key,
  value text not null
);
insert into private.config (key, value) values ('rate_limit_salt', gen_random_uuid()::text);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','media_assets','amenities','rooms','gallery_items','site_content',
                           'posts','hotel_settings','booking_requests','reservations','room_blocks']
  loop
    execute format('create trigger %I before insert or update on public.%I
                    for each row execute function public.set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;
