-- Hotel Bambú Plaza · datos iniciales (identidad conocida, sin inventar datos comerciales)
-- Tarifas, dirección, teléfonos y correos quedan vacíos hasta que el hotel los confirme.

-- Fotografías reales incluidas con el sitio (public/assets/hotel)
insert into public.media_assets (source, path, thumb_path, mime_type, width, height, size_bytes, alt_text, title)
values
  ('bundled', '/assets/hotel/habitacion-blanca.webp',   '/assets/hotel/habitacion-blanca-thumb.webp',   'image/webp', 1280, 960, 122940, 'Habitación con dos camas y ropa de cama blanca', 'Habitación blanca'),
  ('bundled', '/assets/hotel/habitacion-blanca-2.webp', '/assets/hotel/habitacion-blanca-2-thumb.webp', 'image/webp', 960, 1280, 86266,  'Habitación con ropa de cama blanca', 'Habitación blanca 2'),
  ('bundled', '/assets/hotel/habitacion-verde.webp',    '/assets/hotel/habitacion-verde-thumb.webp',    'image/webp', 960, 1280, 66012,  'Habitación con ropa de cama verde', 'Habitación verde'),
  ('bundled', '/assets/hotel/habitacion-verde-2.webp',  '/assets/hotel/habitacion-verde-2-thumb.webp',  'image/webp', 960, 1280, 83002,  'Habitación con ropa de cama verde, otra vista', 'Habitación verde 2'),
  ('bundled', '/assets/hotel/habitacion-azul.webp',     '/assets/hotel/habitacion-azul-thumb.webp',     'image/webp', 960, 1280, 338822, 'Habitación con dos camas y ropa de cama azul', 'Habitación azul'),
  ('bundled', '/assets/hotel/habitacion-azul-2.webp',   '/assets/hotel/habitacion-azul-2-thumb.webp',   'image/webp', 960, 1280, 171154, 'Habitación con ropa de cama azul, otra vista', 'Habitación azul 2'),
  ('bundled', '/assets/hotel/habitacion-camas.webp',    '/assets/hotel/habitacion-camas-thumb.webp',    'image/webp', 960, 1280, 73866,  'Habitación con varias camas', 'Habitación camas'),
  ('bundled', '/assets/hotel/habitacion-camas-2.webp',  '/assets/hotel/habitacion-camas-2-thumb.webp',  'image/webp', 960, 1280, 178240, 'Habitación con varias camas, otra vista', 'Habitación camas 2'),
  ('bundled', '/assets/hotel/habitacion-doble.webp',    '/assets/hotel/habitacion-doble-thumb.webp',    'image/webp', 960, 1280, 185354, 'Habitación doble', 'Habitación doble'),
  ('bundled', '/assets/hotel/habitacion-sencilla.webp', '/assets/hotel/habitacion-sencilla-thumb.webp', 'image/webp', 960, 1280, 85070,  'Habitación con una cama', 'Habitación sencilla'),
  ('bundled', '/assets/hotel/bano.webp',                '/assets/hotel/bano-thumb.webp',                'image/webp', 960, 1280, 95226,  'Baño de una habitación', 'Baño'),
  ('bundled', '/assets/hotel/sala.webp',                '/assets/hotel/sala-thumb.webp',                'image/webp', 960, 1280, 108802, 'Sala de estar del hotel', 'Sala'),
  ('bundled', '/assets/hotel/pasillo.webp',             '/assets/hotel/pasillo-thumb.webp',             'image/webp', 960, 1280, 123492, 'Pasillo y escalera', 'Pasillo'),
  ('bundled', '/assets/hotel/entrada.webp',             '/assets/hotel/entrada-thumb.webp',             'image/webp', 960, 1280, 173020, 'Entrada del Hotel Bambú Plaza', 'Entrada'),
  ('bundled', '/assets/hotel/letrero.webp',             '/assets/hotel/letrero-thumb.webp',             'image/webp', 960, 1280, 277620, 'Letrero exterior del hotel', 'Letrero');

-- Servicios informados por el hotel en la versión anterior del sitio
insert into public.amenities (name, sort_order) values
  ('Baño privado', 1), ('Televisión por cable', 2), ('Ventilador', 3), ('WiFi', 4);

-- Las 16 habitaciones existentes. Tipo/capacidad provienen del prototipo y están
-- marcados como no confirmados (details_confirmed = false). Tarifa vacía.
insert into public.rooms (number, name, room_type, capacity, cover_media_id, operational_status, publish_status, sort_order, published_at)
select lpad(i::text, 2, '0'),
       'Habitación ' || lpad(i::text, 2, '0'),
       case when (i - 1) % 5 = 1 then 'Familiar' when (i - 1) % 3 = 0 then 'Individual' else 'Doble' end,
       case when (i - 1) % 5 = 1 then 4 when (i - 1) % 3 = 0 then 1 else 2 end,
       (select id from public.media_assets where path = '/assets/hotel/' ||
          case when (i - 1) % 4 = 0 then 'habitacion-verde' when (i - 1) % 3 = 0 then 'habitacion-azul' else 'habitacion-blanca' end || '.webp'),
       'available', 'published', i, now()
from generate_series(1, 16) as i;

insert into public.room_amenities (room_id, amenity_id)
select r.id, a.id from public.rooms r cross join public.amenities a;

insert into public.room_images (room_id, media_id, sort_order)
select r.id, r.cover_media_id, 0 from public.rooms r;

-- Galería (9 fotografías reales). La foto de recepción se excluyó: mostraba personas y el monitor de seguridad.
insert into public.gallery_items (media_id, caption, category, sort_order)
select m.id, g.caption, g.category, g.ord
from (values
  ('habitacion-blanca', 'Habitación con dos camas', 'Habitaciones', 1),
  ('habitacion-verde', 'Habitación con ropa de cama verde', 'Habitaciones', 2),
  ('habitacion-azul', 'Habitación con dos camas', 'Habitaciones', 3),
  ('habitacion-sencilla', 'Habitación con cama', 'Habitaciones', 4),
  ('bano', 'Baño de una habitación', 'Habitaciones', 5),
  ('sala', 'Sala del hotel', 'Espacios comunes', 6),
  ('pasillo', 'Pasillo y escalera', 'Espacios comunes', 8),
  ('entrada', 'Entrada del Hotel Bambú', 'Fachada', 9),
  ('letrero', 'Letrero exterior del hotel', 'Fachada', 10)
) as g(name, caption, category, ord)
join public.media_assets m on m.path = '/assets/hotel/' || g.name || '.webp';

-- Textos del sitio (los existentes en la versión anterior)
insert into public.site_content (key, value, published_at) values
('home.hero', jsonb_build_object(
   'eyebrow', 'Hotel Bambú Plaza · Mocoa, Putumayo',
   'headline', 'Llegar, descansar, sentirse bien.',
   'intro', 'Habitaciones privadas y atención cercana para tu paso por Mocoa. Conoce nuestros espacios y consulta tu estadía directamente con el hotel.',
   'autoplay', true,
   'slides', (select jsonb_agg(id order by array_position(array['/assets/hotel/habitacion-blanca.webp','/assets/hotel/habitacion-verde.webp','/assets/hotel/sala.webp'], path))
              from public.media_assets where path in ('/assets/hotel/habitacion-blanca.webp','/assets/hotel/habitacion-verde.webp','/assets/hotel/sala.webp'))
 ), now()),
('home.welcome', jsonb_build_object(
   'eyebrow', 'Bienvenido a Bambú Plaza',
   'title', 'Un lugar sencillo para descansar en Mocoa.',
   'body', 'Después de un día de viaje, hace falta un espacio tranquilo. Aquí encuentras habitaciones privadas, baño, televisión por cable, ventilador y conexión WiFi.' || chr(10) || chr(10) || 'Conoce el hotel a través de fotografías reales y consúltanos para elegir la habitación adecuada para tu visita.',
   'media_id', (select id from public.media_assets where path = '/assets/hotel/sala.webp')
 ), now()),
('home.services', jsonb_build_object(
   'eyebrow', 'Lo que encontrarás',
   'title', 'Lo esencial para estar cómodo.',
   'intro', 'Servicios informados por el hotel. Consulta los detalles de tu habitación al solicitar la estadía.',
   'items', jsonb_build_array(
     jsonb_build_object('name', 'WiFi', 'detail', 'En habitaciones y pisos'),
     jsonb_build_object('name', 'Baño privado', 'detail', 'En las habitaciones'),
     jsonb_build_object('name', 'Televisión por cable', 'detail', 'Para tu tiempo de descanso'),
     jsonb_build_object('name', 'Ventilador', 'detail', 'En las habitaciones'),
     jsonb_build_object('name', 'Paneles solares', 'detail', 'Parte de las instalaciones'),
     jsonb_build_object('name', 'Reserva de agua', 'detail', 'Parte de las instalaciones'))
 ), now()),
('about', jsonb_build_object('mission', '', 'vision', '', 'institutional', ''), now()),
('faq', jsonb_build_object('items', '[]'::jsonb), now()),
('policies', jsonb_build_object('items', '[]'::jsonb), now()),
('footer', jsonb_build_object(
   'tagline', 'Un lugar sencillo para descansar en Mocoa. Conoce nuestras habitaciones y consulta tu estadía.',
   'note', 'Las solicitudes se confirman directamente con el hotel.'
 ), now());

insert into public.hotel_settings (id, hotel_name, city) values (1, 'Hotel Bambú Plaza', 'Mocoa, Putumayo, Colombia');

insert into public.public_revisions (scope, rev)
select s, 1 from unnest(array['rooms','media','gallery','posts','content','settings','availability']) s
on conflict (scope) do nothing;

-- La carga inicial no es actividad de un usuario
delete from public.audit_logs;
