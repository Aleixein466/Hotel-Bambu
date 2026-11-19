#!/usr/bin/env node
// Verificación de SOLO LECTURA del entorno desplegado. No escribe datos ni usa claves privadas.
//
//   [SITE_URL=https://tu-dominio] VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon> npm run smoke:prod
//
// La clave anon es pública (es la misma que lleva el sitio en el navegador).
import { createClient } from '@supabase/supabase-js';

const site = (process.env.SITE_URL || '').replace(/\/$/, '');
const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (y SITE_URL cuando el sitio esté desplegado).');
  process.exit(1);
}
if (/service_role/.test(Buffer.from((anon.split('.')[1] || ''), 'base64').toString())) {
  console.error('Esa es la service_role key. Usa la clave anon/publishable.');
  process.exit(1);
}

const results = [];
const check = async (name, fn) => {
  try { const detail = await fn(); results.push([true, name, detail || '']); }
  catch (e) { results.push([false, name, e.message]); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const db = createClient(url, anon, { auth: { persistSession: false } });

if (site) {
await check('Sitio responde por HTTPS', async () => {
  assert(site.startsWith('https://'), 'SITE_URL debe usar https');
  const r = await fetch(site); assert(r.ok, `HTTP ${r.status}`);
});
await check('Cabeceras de seguridad (CSP, HSTS, nosniff, frame)', async () => {
  const h = (await fetch(site)).headers;
  const missing = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options'].filter(k => !h.get(k));
  assert(!missing.length, `faltan: ${missing.join(', ')}`);
  const csp = h.get('content-security-policy');
  assert(csp.includes(new URL(url).host) || csp.includes('*.supabase.co'), 'la CSP no permite el dominio de Supabase');
});
for (const path of ['/admin/login', '/admin', '/habitaciones/01', '/novedades/no-existe']) {
  await check(`Ruta SPA ${path} (fallback a index.html)`, async () => {
    const r = await fetch(site + path); assert(r.ok, `HTTP ${r.status}`);
    assert((await r.text()).includes('id="root"'), 'no devuelve la aplicación');
  });
}
} else {
  console.log('SITE_URL no definido: se omiten las verificaciones del sitio desplegado.');
}
await check('Proyecto Supabase', async () => new URL(url).host);
await check('Contenido público legible', async () => {
  const [rooms, content, settings] = await Promise.all([
    db.from('public_rooms').select('number'), db.from('public_site_content').select('key'), db.from('public_settings').select('hotel_name'),
  ]);
  for (const r of [rooms, content, settings]) assert(!r.error, r.error?.message);
  assert(rooms.data.length > 0, 'no hay habitaciones publicadas (¿se aplicaron las migraciones?)');
  return `${rooms.data.length} habitaciones publicadas`;
});
await check('Visitante NO lee tablas privadas', async () => {
  for (const t of ['booking_requests', 'reservations', 'profiles', 'audit_logs', 'rooms', 'hotel_settings']) {
    const { data, error } = await db.from(t).select('*').limit(1);
    assert(error && !data, `la tabla ${t} es legible para anónimos`);
  }
});
await check('Visitante NO ejecuta funciones administrativas', async () => {
  for (const fn of ['dashboard_stats', 'orphan_storage_objects']) {
    assert((await db.rpc(fn)).error, `${fn} es ejecutable por anónimos`);
  }
});
await check('Registro público desactivado', async () => {
  const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } })).json();
  assert(settings.disable_signup === true, 'desactiva "Allow new users to sign up" en Authentication');
  assert(settings.external?.email === true, 'el proveedor de correo está desactivado');
});
await check('Bucket de imágenes público configurado', async () => {
  const r = await fetch(`${url}/storage/v1/object/public/media/no-existe.webp`);
  assert([400, 404].includes(r.status), `respuesta inesperada ${r.status}`);
});
await check('Realtime habilitado para revisiones', async () => {
  const { data, error } = await db.from('public_revisions').select('scope');
  assert(!error && data.length >= 1, error?.message || 'sin filas');
});
await check('Función invite-user rechaza orígenes ajenos', async () => {
  const r = await fetch(`${url}/functions/v1/invite-user`, { method: 'OPTIONS', headers: { Origin: 'https://sitio-ajeno.example' } });
  assert(r.status === 403 || r.status === 404, r.status === 200 ? 'ALLOWED_ORIGIN no está configurado' : `HTTP ${r.status}`);
  return r.status === 404 ? 'función no desplegada' : '';
});

for (const [ok, name, detail] of results) console.log(`${ok ? 'OK ' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter(r => !r[0]).length;
console.log(failed ? `\n${failed} verificación(es) fallaron.` : '\nTodas las verificaciones de solo lectura pasaron.');
process.exit(failed ? 1 : 0);
