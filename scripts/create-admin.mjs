#!/usr/bin/env node
// Crea (o promueve) un usuario del panel de forma segura.
//
// Uso:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-admin.mjs --email dueno@hotel.com --name "Nombre" [--role admin|editor] [--invite]
//
// - Sin --invite: pide la contraseña de forma oculta en la terminal (o ADMIN_PASSWORD para CI/pruebas).
// - Con --invite: Supabase envía un correo para que la persona cree su propia contraseña.
// - La service_role key solo se usa en esta terminal; nunca se guarda ni se envía al navegador.
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, arg, i, all) => {
  if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]);
  return acc;
}, []));

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = String(args.email || '').trim().toLowerCase();
const fullName = String(args.name || '').trim();
const role = args.role || 'admin';

function fail(message) { console.error(`Error: ${message}`); process.exit(1); }
if (!url || !serviceKey) fail('define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno (no en el repositorio).');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('usa --email con un correo válido.');
if (!['admin', 'editor'].includes(role)) fail('--role debe ser admin o editor.');
if (args.invite && !/^https?:\/\/[^\s]+\/admin\/restablecer$/.test(String(args.redirect || ''))) fail('con --invite usa --redirect https://tu-dominio/admin/restablecer');

function askHidden(question) {
  return new Promise(resolve => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (text.includes(question)) process.stdout.write(text); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

function weak(password) {
  return password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser() {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(error.message);
    const found = data.users.find(u => u.email?.toLowerCase() === email);
    if (found || data.users.length < 200) return found;
  }
  return undefined;
}

let user = await findUser();
if (!user) {
  if (args.invite) {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo: args.redirect });
    if (error) fail(error.message);
    user = data.user;
    console.log('Invitación enviada. La persona definirá su contraseña desde el correo.');
  } else {
    const password = process.env.ADMIN_PASSWORD || await askHidden('Contraseña (mín. 10, mayúsculas, minúsculas y números): ');
    if (weak(password)) fail('contraseña débil.');
    if (!process.env.ADMIN_PASSWORD) {
      const again = await askHidden('Repite la contraseña: ');
      if (again !== password) fail('las contraseñas no coinciden.');
    }
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error) fail(error.message);
    user = data.user;
  }
} else {
  console.log('El usuario ya existe en Auth; se actualizará su perfil.');
}

const { error } = await supabase.from('profiles').upsert({ id: user.id, email, full_name: fullName, role, active: true }, { onConflict: 'id' });
if (error) fail(error.message);
console.log(`Listo: ${email} tiene rol "${role}". Ingresa en /admin/login.`);
