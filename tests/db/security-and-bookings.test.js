// Pruebas de integración contra Supabase local real (RLS, RPC, restricciones, concurrencia).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { anonClient, ensureUsers, isoDaysFromToday, resetRateLimits, serviceClient, signedIn } from '../helpers.js';

let service, anon, admin, editor, outsider, room;
// Ventanas de fechas sin solapamiento entre pruebas (la habitación de prueba es nueva en cada ejecución)
let slot = 0;
const nextWindow = () => 30 + 15 * slot++;

const submit = (client, over = {}) => client.rpc('submit_booking_request', {
  p_room_id: room.id, p_check_in: over.in, p_check_out: over.out, p_guests: over.guests ?? 2,
  p_guest_name: over.name ?? 'Huésped Prueba', p_phone: over.phone ?? `300${Math.floor(1e6 + Math.random() * 8e6)}`,
  p_consent: over.consent ?? true, p_website: over.website ?? '',
});

beforeAll(async () => {
  await ensureUsers();
  service = serviceClient();
  anon = anonClient();
  [admin, editor, outsider] = await Promise.all([signedIn('admin'), signedIn('editor'), signedIn('outsider')]);
  const number = `T${Math.floor(Math.random() * 1e6)}`;
  const { data, error } = await service.from('rooms').insert({
    number, name: `Prueba ${number}`, capacity: 3, publish_status: 'published', operational_status: 'available', sort_order: 999,
  }).select().single();
  if (error) throw error;
  room = data;
});

beforeEach(() => resetRateLimits());

afterAll(async () => {
  if (!room) return;
  await service.from('booking_requests').update({ reservation_id: null }).eq('room_id', room.id);
  await service.from('reservations').delete().eq('room_id', room.id);
  await service.from('booking_requests').delete().eq('room_id', room.id);
  await service.from('room_blocks').delete().eq('room_id', room.id);
  await service.from('rooms').delete().eq('id', room.id);
});

describe('Prueba A/H — visitantes sin sesión', () => {
  it('no pueden leer tablas base ni datos personales', async () => {
    for (const table of ['rooms', 'booking_requests', 'reservations', 'room_blocks', 'profiles', 'audit_logs', 'hotel_settings', 'posts', 'site_content', 'media_assets']) {
      const { data, error } = await anon.from(table).select('*').limit(1);
      expect(error, table).toBeTruthy();
      expect(data, table).toBeNull();
    }
  });

  it('no pueden modificar habitaciones, contenido, precios ni configuración', async () => {
    const attempts = [
      anon.from('rooms').update({ price_cop: 1 }).eq('id', room.id),
      anon.from('hotel_settings').update({ whatsapp: '573000000000' }).eq('id', 1),
      anon.from('posts').insert({ slug: 'hack', title: 'x' }),
      anon.from('public_site_content').update({ value: {} }).eq('key', 'footer'),
      anon.from('public_rooms').update({ price_cop: 1 }).eq('id', room.id),
      anon.rpc('publish_room', { p_room_id: room.id }),
      anon.rpc('dashboard_stats'),
    ];
    for (const res of await Promise.all(attempts)) expect(res.error).toBeTruthy();
    const { data } = await service.from('rooms').select('price_cop').eq('id', room.id).single();
    expect(data.price_cop).toBeNull();
  });

  it('la biblioteca de imágenes solo expone imágenes usadas en contenido publicado', async () => {
    const { data: m } = await service.from('media_assets').insert({ source: 'bundled', path: `/assets/test-${Date.now()}.webp`, mime_type: 'image/webp' }).select().single();
    expect((await anon.from('public_media').select('id').eq('id', m.id)).data).toEqual([]);
    await service.from('media_assets').delete().eq('id', m.id);
  });

  it('las vistas públicas no exponen borradores ni datos internos', async () => {
    const { data, error } = await anon.from('public_rooms').select('*').limit(1);
    expect(error).toBeNull();
    expect(Object.keys(data[0])).not.toContain('draft');
    expect(Object.keys(data[0])).not.toContain('updated_by');
  });

  it('un usuario autenticado sin rol no obtiene nada restringido', async () => {
    const { data: role } = await outsider.rpc('current_staff_role');
    expect(role).toBeNull();
    const { data } = await outsider.from('booking_requests').select('*');
    expect(data ?? []).toEqual([]);
    const upd = await outsider.from('rooms').update({ price_cop: 5 }).eq('id', room.id).select();
    expect(upd.data ?? []).toEqual([]);
  });
});

describe('Prueba G — solicitudes y reservas', () => {
  it('valida fechas, capacidad, consentimiento y trampa anti-spam en el servidor', async () => {
    const base = nextWindow();
    const cases = [
      [{ in: isoDaysFromToday(-1), out: isoDaysFromToday(2) }, 'DATES'],
      [{ in: isoDaysFromToday(base + 3), out: isoDaysFromToday(base + 3) }, 'DATES'],
      [{ in: isoDaysFromToday(base), out: isoDaysFromToday(base + 2), guests: 9 }, 'CAPACITY'],
      [{ in: isoDaysFromToday(base), out: isoDaysFromToday(base + 2), consent: false }, 'CONSENT'],
      [{ in: isoDaysFromToday(base), out: isoDaysFromToday(base + 2), website: 'http://spam' }, 'SPAM'],
      [{ in: isoDaysFromToday(base), out: isoDaysFromToday(base + 2), phone: '12' }, 'PHONE'],
    ];
    for (const [input, hint] of cases) {
      const { error } = await submit(anon, input);
      expect(error?.hint, JSON.stringify(input)).toBe(hint);
    }
  });

  it('registra la solicitud como pendiente, con código, y el visitante no puede leerla', async () => {
    const d = nextWindow();
    const { data, error } = await submit(anon, { in: isoDaysFromToday(d), out: isoDaysFromToday(d + 2) });
    expect(error).toBeNull();
    expect(data[0].code).toMatch(/^BP-[0-9A-F]{8}$/);
    const own = await anon.from('booking_requests').select('*').eq('id', data[0].id);
    expect(own.data).toBeNull();
    const stored = await service.from('booking_requests').select('status').eq('id', data[0].id).single();
    expect(stored.data.status).toBe('pending');
    const res = await service.from('reservations').select('id').eq('request_id', data[0].id);
    expect(res.data).toEqual([]); // nunca se convierte sola en reserva
  });

  it('el editor no ve solicitudes ni puede confirmarlas', async () => {
    const d = nextWindow();
    const { data } = await submit(anon, { in: isoDaysFromToday(d), out: isoDaysFromToday(d + 1) });
    const read = await editor.from('booking_requests').select('*').eq('id', data[0].id);
    expect(read.data ?? []).toEqual([]);
    const confirm = await editor.rpc('confirm_booking_request', { p_request_id: data[0].id });
    expect(confirm.error?.code).toBe('42501');
  });

  it('impide dos reservas confirmadas superpuestas, incluso en concurrencia', async () => {
    const d = nextWindow();
    const a = await submit(anon, { in: isoDaysFromToday(d), out: isoDaysFromToday(d + 3) });
    const b = await submit(anon, { in: isoDaysFromToday(d + 1), out: isoDaysFromToday(d + 4) });
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    const results = await Promise.all([
      admin.rpc('confirm_booking_request', { p_request_id: a.data[0].id }),
      admin.rpc('confirm_booking_request', { p_request_id: b.data[0].id }),
    ]);
    const ok = results.filter(r => !r.error);
    const failed = results.filter(r => r.error);
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0].error.code).toBe('23P01');

    // Ya ocupada: una nueva solicitud pública en esas fechas se rechaza
    const c = await submit(anon, { in: isoDaysFromToday(d + 2), out: isoDaysFromToday(d + 3) });
    expect(c.error?.hint).toBe('UNAVAILABLE');

    // Salida y entrada el mismo día sí se permiten
    const winner = ok[0] === results[0] ? { in: d, out: d + 3 } : { in: d + 1, out: d + 4 };
    const e = await submit(anon, { in: isoDaysFromToday(winner.out), out: isoDaysFromToday(winner.out + 1) });
    expect(e.error).toBeNull();
    const conf = await admin.rpc('confirm_booking_request', { p_request_id: e.data[0].id });
    expect(conf.error).toBeNull();

    // Los rangos ocupados públicos no contienen datos personales
    const busy = await anon.rpc('room_busy_ranges', { p_room_id: room.id, p_from: isoDaysFromToday(0), p_to: isoDaysFromToday(600) });
    expect(busy.error).toBeNull();
    expect(Object.keys(busy.data[0]).sort()).toEqual(['end_date', 'start_date']);
  });

  it('una solicitud gestionada no se confirma dos veces y el historial se conserva', async () => {
    const d = nextWindow();
    const { data } = await submit(anon, { in: isoDaysFromToday(d), out: isoDaysFromToday(d + 1) });
    expect((await admin.rpc('set_booking_request_status', { p_request_id: data[0].id, p_status: 'rejected' })).error).toBeNull();
    const again = await admin.rpc('confirm_booking_request', { p_request_id: data[0].id });
    expect(again.error?.hint).toBe('NOT_PENDING');
    const row = await admin.from('booking_requests').select('status,code').eq('id', data[0].id).single();
    expect(row.data.status).toBe('rejected');
  });

  it('los bloqueos impiden confirmar y no pueden pisar reservas', async () => {
    const d = nextWindow();
    const blk = await admin.from('room_blocks').insert({ room_id: room.id, start_date: isoDaysFromToday(d), end_date: isoDaysFromToday(d + 1), reason: 'Pintura' }).select().single();
    expect(blk.error).toBeNull();
    const req = await submit(anon, { in: isoDaysFromToday(d + 1), out: isoDaysFromToday(d + 2) });
    expect(req.error?.hint).toBe('UNAVAILABLE');
    const manual = await admin.from('reservations').insert({ room_id: room.id, guest_name: 'Manual', check_in: isoDaysFromToday(d), check_out: isoDaysFromToday(d + 1), guests: 1 });
    expect(manual.error?.hint).toBe('ROOM_BLOCKED');
    const editorBlock = await editor.from('room_blocks').insert({ room_id: room.id, start_date: isoDaysFromToday(d + 40), end_date: isoDaysFromToday(d + 41) });
    expect(editorBlock.error).toBeTruthy();
  });

  it('cancelar la reserva actualiza la solicitud; reabrir y reconfirmar funciona', async () => {
    const d = nextWindow();
    const { data } = await submit(anon, { in: isoDaysFromToday(d), out: isoDaysFromToday(d + 1) });
    const id = data[0].id;
    const resId = (await admin.rpc('confirm_booking_request', { p_request_id: id })).data;
    expect((await admin.from('reservations').update({ status: 'cancelled' }).eq('id', resId)).error).toBeNull();
    expect((await admin.from('booking_requests').select('status').eq('id', id).single()).data.status).toBe('cancelled');
    expect((await admin.rpc('set_booking_request_status', { p_request_id: id, p_status: 'pending' })).error).toBeNull();
    const again = await admin.rpc('confirm_booking_request', { p_request_id: id });
    expect(again.error).toBeNull();
  });

  it('rangos ocupados no se revelan para habitaciones ocultas', async () => {
    await service.from('rooms').update({ publish_status: 'hidden' }).eq('id', room.id);
    const busy = await anon.rpc('room_busy_ranges', { p_room_id: room.id, p_from: isoDaysFromToday(0), p_to: isoDaysFromToday(600) });
    expect(busy.data).toEqual([]);
    await service.from('rooms').update({ publish_status: 'published' }).eq('id', room.id);
  });

  it('límite de solicitudes por teléfono', async () => {
    const phone = `31${Math.floor(1e7 + Math.random() * 8e7)}`;
    const d = nextWindow();
    for (let i = 0; i < 3; i++) {
      const r = await submit(anon, { in: isoDaysFromToday(d + i * 2), out: isoDaysFromToday(d + i * 2 + 1), phone });
      expect(r.error).toBeNull();
    }
    const fourth = await submit(anon, { in: isoDaysFromToday(d + 10), out: isoDaysFromToday(d + 11), phone });
    expect(fourth.error?.hint).toBe('RATE_LIMIT');
  });
});

describe('Prueba C — publicación de habitaciones', () => {
  it('el borrador no se ve en público hasta publicar; ocultar la retira del catálogo', async () => {
    const save = await editor.from('rooms').update({ draft: { price_cop: 123000, description: 'Descripción publicada en prueba' } }).eq('id', room.id).select();
    expect(save.error).toBeNull();
    expect(save.data).toHaveLength(1);
    let pub = await anon.from('public_rooms').select('price_cop,description').eq('id', room.id).single();
    expect(pub.data.price_cop).toBeNull();

    expect((await editor.rpc('publish_room', { p_room_id: room.id })).error).toBeNull();
    pub = await anon.from('public_rooms').select('price_cop,description').eq('id', room.id).single();
    expect(pub.data).toEqual({ price_cop: 123000, description: 'Descripción publicada en prueba' });

    await editor.from('rooms').update({ publish_status: 'hidden' }).eq('id', room.id);
    pub = await anon.from('public_rooms').select('id').eq('id', room.id);
    expect(pub.data).toEqual([]);
    const history = await admin.from('booking_requests').select('id').eq('room_id', room.id);
    expect(history.data.length).toBeGreaterThan(0); // historial intacto
    await editor.from('rooms').update({ publish_status: 'published' }).eq('id', room.id);
  });

  it('solo un administrador desactiva habitaciones; nadie las borra', async () => {
    const byEditor = await editor.from('rooms').update({ operational_status: 'inactive' }).eq('id', room.id);
    expect(byEditor.error?.hint).toBe('ADMIN_ONLY');
    const del = await admin.from('rooms').delete().eq('id', room.id);
    expect(del.error).toBeTruthy();
  });

  it('registra auditoría con el autor', async () => {
    const { data } = await admin.from('audit_logs').select('actor_email,action,entity').eq('entity', 'rooms').eq('entity_id', room.id).order('id', { ascending: false }).limit(5);
    expect(data.some(r => r.actor_email === 'editor@bambu.local' && r.action === 'update')).toBe(true);
    const asEditor = await editor.from('audit_logs').select('*').limit(1);
    expect(asEditor.data ?? []).toEqual([]);
  });
});

describe('Prueba D — publicaciones', () => {
  it('borrador → publicada → editada → despublicada → papelera', async () => {
    const slug = `prueba-${Date.now()}`;
    const created = await editor.from('posts').insert({ slug, title: 'Borrador', draft: { title: 'Promo de prueba', excerpt: 'Uno', body: 'Texto' } }).select().single();
    expect(created.error).toBeNull();
    const id = created.data.id;
    const view = () => anon.from('public_posts').select('title,excerpt').eq('slug', slug);
    expect((await view()).data).toEqual([]);

    expect((await editor.rpc('publish_post', { p_post_id: id })).error).toBeNull();
    expect((await view()).data).toEqual([{ title: 'Promo de prueba', excerpt: 'Uno' }]);

    await editor.from('posts').update({ draft: { excerpt: 'Dos' } }).eq('id', id);
    expect((await view()).data[0].excerpt).toBe('Uno');
    await editor.rpc('publish_post', { p_post_id: id });
    expect((await view()).data[0].excerpt).toBe('Dos');

    await editor.from('posts').update({ status: 'unpublished' }).eq('id', id);
    expect((await view()).data).toEqual([]);
    await editor.from('posts').update({ status: 'published', deleted_at: new Date().toISOString() }).eq('id', id);
    expect((await view()).data).toEqual([]);

    expect((await editor.from('posts').delete().eq('id', id).select()).data ?? []).toEqual([]); // editor no purga
    const purge = await admin.from('posts').delete().eq('id', id).select();
    expect(purge.data).toHaveLength(1);
  });
});

describe('Contenido del sitio y galería', () => {
  it('textos: borrador invisible, publicar visible; galería: ocultar retira la foto', async () => {
    const original = (await service.from('site_content').select('value').eq('key', 'footer').single()).data.value;
    const tagline = `Lema de prueba ${Date.now()}`;
    await editor.from('site_content').update({ draft: { ...original, tagline } }).eq('key', 'footer');
    const view = async () => (await anon.from('public_site_content').select('value').eq('key', 'footer').single()).data.value.tagline;
    expect(await view()).toBe(original.tagline);
    expect((await editor.rpc('publish_content', { p_key: 'footer' })).error).toBeNull();
    expect(await view()).toBe(tagline);
    await service.from('site_content').update({ value: original }).eq('key', 'footer');

    const item = (await service.from('gallery_items').select('id').limit(1).single()).data;
    await editor.from('gallery_items').update({ published: false }).eq('id', item.id);
    expect((await anon.from('public_gallery').select('id').eq('id', item.id)).data).toEqual([]);
    await editor.from('gallery_items').update({ published: true }).eq('id', item.id);
    expect((await anon.from('public_gallery').select('id').eq('id', item.id)).data).toHaveLength(1);
  });
});

describe('Configuración y perfiles', () => {
  it('solo el administrador cambia la configuración; el público la ve al instante', async () => {
    const byEditor = await editor.from('hotel_settings').update({ phone: '000' }).eq('id', 1).select();
    expect(byEditor.data ?? []).toEqual([]);
    const before = (await service.from('hotel_settings').select('business_hours').eq('id', 1).single()).data.business_hours;
    const mark = `Prueba ${Date.now()}`;
    expect((await admin.from('hotel_settings').update({ business_hours: mark }).eq('id', 1)).error).toBeNull();
    expect((await anon.from('public_settings').select('business_hours').single()).data.business_hours).toBe(mark);
    await service.from('hotel_settings').update({ business_hours: before }).eq('id', 1);
  });

  it('nadie cambia su propio rol y el editor no administra usuarios', async () => {
    const { data: me } = await editor.auth.getUser();
    const self = await editor.from('profiles').update({ role: 'admin' }).eq('id', me.user.id);
    expect(self.error?.hint).toBe('SELF_ROLE');
    const others = await editor.from('profiles').select('*');
    expect(others.data).toHaveLength(1);
    const { data: adminUser } = await admin.auth.getUser();
    const selfAdmin = await admin.from('profiles').update({ active: false }).eq('id', adminUser.user.id);
    expect(selfAdmin.error?.hint).toBe('SELF_ROLE');
  });
});
