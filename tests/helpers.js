// Utilidades compartidas por pruebas de BD y E2E. Solo para el entorno local de Supabase.
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';

// Claves del Supabase LOCAL, leídas en tiempo de ejecución (nunca escritas en el repositorio).
function localStatus() {
  if (process.env.TEST_SUPABASE_ANON_KEY && process.env.TEST_SUPABASE_SERVICE_ROLE_KEY) return {};
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return Object.fromEntries(out.split('\n').map(l => l.trim().match(/^([A-Z_]+)="?([^"]*)"?$/)).filter(Boolean).map(m => [m[1], m[2]]));
}
const local = localStatus();

export const URL = process.env.TEST_SUPABASE_URL || local.API_URL || 'http://127.0.0.1:54321';
export const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY || local.ANON_KEY;
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY || local.SERVICE_ROLE_KEY;

if (!/127\.0\.0\.1|localhost/.test(URL) && !process.env.ALLOW_REMOTE_TESTS) {
  throw new Error('Las pruebas modifican datos: solo se ejecutan contra Supabase local (o define ALLOW_REMOTE_TESTS en un entorno de pruebas).');
}

export const USERS = {
  admin: { email: 'admin@bambu.local', password: 'LocalAdmin2026x', role: 'admin', name: 'Admin Local' },
  editor: { email: 'editor@bambu.local', password: 'LocalEditor2026x', role: 'editor', name: 'Editor Local' },
  outsider: { email: 'sinrol@bambu.local', password: 'LocalNoRole2026x', role: null, name: 'Sin rol' },
};

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const anonClient = () => createClient(URL, ANON_KEY, opts);
export const serviceClient = () => createClient(URL, SERVICE_KEY, opts);

export async function ensureUsers() {
  const service = serviceClient();
  const { data } = await service.auth.admin.listUsers({ perPage: 1000 });
  for (const u of Object.values(USERS)) {
    let user = data.users.find(x => x.email === u.email);
    if (!user) {
      const res = await service.auth.admin.createUser({ email: u.email, password: u.password, email_confirm: true });
      if (res.error) throw res.error;
      user = res.data.user;
    }
    if (u.role) {
      const { error } = await service.from('profiles').upsert({ id: user.id, email: u.email, full_name: u.name, role: u.role, active: true });
      if (error) throw error;
    }
  }
}

export async function signedIn(kind) {
  const client = createClient(URL, ANON_KEY, opts);
  const { error } = await client.auth.signInWithPassword({ email: USERS[kind].email, password: USERS[kind].password });
  if (error) throw error;
  return client;
}

/** Limpia el registro de límites de solicitudes (solo local) para que las pruebas no se bloqueen entre sí. */
export function resetRateLimits() {
  execSync('docker exec supabase_db_HOTEL_BAMBU psql -U postgres -c "truncate private.request_rate_limits"', { stdio: 'ignore' });
}

export function isoDaysFromToday(days) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Desplazamiento aleatorio para que ejecuciones repetidas no choquen con datos previos. */
export const randomOffset = () => 200 + Math.floor(Math.random() * 300);

// ---- TOTP (RFC 6238) para probar MFA sin dependencias ----
import { createHmac } from 'node:crypto';

function base32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
}

export const totpStep = () => Math.floor(Date.now() / 30000);

export function totp(secret, step = totpStep()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(6, '0');
}

// ---- Mailpit (correos locales de Supabase) ----
const MAILPIT = 'http://127.0.0.1:54324/api/v1';

export async function latestEmailLink(to, { timeout = 20000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const search = await (await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    const id = search.messages?.[0]?.ID;
    if (id) {
      const msg = await (await fetch(`${MAILPIT}/message/${id}`)).json();
      // Plantillas con token_hash (supabase/templates) o enlace clásico /auth/v1/verify
      const link = (msg.HTML || msg.Text || '').match(/https?:\/\/[^\s"'<>)]+(?:\/admin\/restablecer\?token_hash=|\/auth\/v1\/verify)[^\s"'<>)]*/)?.[0];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`No llegó el correo a ${to}`);
}

export async function createTempUser(role = 'admin') {
  const service = serviceClient();
  const email = `temp-${Date.now()}-${Math.floor(Math.random() * 1e4)}@bambu.local`;
  const password = `Temp${Date.now()}x`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  if (role) await service.from('profiles').insert({ id: data.user.id, email, full_name: 'Temporal', role, active: true });
  return { id: data.user.id, email, password };
}

export async function deleteUser(id) {
  const service = serviceClient();
  await service.from('profiles').delete().eq('id', id);
  await service.auth.admin.deleteUser(id);
}
