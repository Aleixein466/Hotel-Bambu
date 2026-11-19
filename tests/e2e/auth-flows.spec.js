// MFA, recuperación de contraseña, invitaciones y revocación de acceso, contra Supabase local + Mailpit.
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { ANON_KEY, URL, createTempUser, deleteUser, ensureUsers, latestEmailLink, serviceClient, signedIn, totp, totpStep, USERS } from '../helpers.js';

const service = serviceClient();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };

async function uiLogin(page, email, password) {
  await page.goto('/admin/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

/** Con plantillas token_hash el token solo se canjea al pulsar "Continuar" (protege de escáneres de correo). */
async function openEmailLink(page, link) {
  await page.goto(link);
  if (link.includes('token_hash=')) {
    await expect(page.locator('input[name="new-password"]')).toHaveCount(0); // abrir el enlace no consume el token
    await page.getByRole('button', { name: 'Continuar' }).click();
  }
  await expect(page).toHaveURL(/\/admin\/restablecer/);
  await expect(page.locator('input[name="new-password"]')).toBeVisible();
}

async function waitNextTotpStep(previous) {
  while (totpStep() === previous) await new Promise(r => setTimeout(r, 500));
}

test.beforeAll(() => ensureUsers());

test('MFA: activación, permisos exigen AAL2 y el login pide el código', async ({ page }) => {
  test.setTimeout(150_000);
  const user = await createTempUser('admin');
  try {
    await uiLogin(page, user.email, user.password);
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto('/admin/cuenta');
    await page.getByRole('button', { name: 'Configurar app autenticadora' }).click();
    const secret = (await page.locator('.ops-secret').textContent()).trim();
    const step = totpStep();
    await page.locator('input[name="totp-code"]').fill(totp(secret, step));
    await page.getByRole('button', { name: 'Verificar y activar' }).click();
    await expect(page.getByText('Activa', { exact: true })).toBeVisible();

    // Con solo contraseña (AAL1) el servidor ya no reconoce el rol: RLS bloquea todo
    const api = createClient(URL, ANON_KEY, opts);
    await api.auth.signInWithPassword({ email: user.email, password: user.password });
    expect((await api.rpc('current_staff_role')).data).toBeNull();
    expect((await api.from('booking_requests').select('id')).data).toEqual([]);
    expect((await api.from('hotel_settings').update({ phone: '1' }).eq('id', 1).select()).data).toEqual([]);

    // La interfaz exige el segundo factor
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await uiLogin(page, user.email, user.password);
    await expect(page.getByRole('heading', { name: 'Verificación en dos pasos' })).toBeVisible();
    await page.goto('/admin/solicitudes');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.getByLabel('Código').fill('000000');
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page.getByRole('alert')).toContainText('Código incorrecto');

    await waitNextTotpStep(step); // un código no se reutiliza
    await page.getByLabel('Código').fill(totp(secret));
    await page.getByRole('button', { name: 'Verificar' }).click();
    await expect(page).toHaveURL(/\/admin(\/solicitudes)?$/);
    await page.goto('/admin/solicitudes');
    await expect(page.getByRole('heading', { name: 'Solicitudes', exact: false }).first()).toBeVisible();
  } finally {
    await deleteUser(user.id);
  }
});

test('Recuperación de contraseña por correo, abierta en otro dispositivo', async ({ browser }) => {
  let page = await (await browser.newContext()).newPage();
  const user = await createTempUser('editor');
  try {
    await page.goto('/admin/recuperar');
    await page.getByLabel('Correo electrónico').fill(user.email);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByText('Si el correo pertenece a una cuenta')).toBeVisible();

    await page.context().close();
    page = await (await browser.newContext()).newPage(); // otro "dispositivo"
    const link = await latestEmailLink(user.email);
    expect(link).toContain('token_hash='); // la plantilla de producción está activa
    await openEmailLink(page, link);
    const newPassword = `Nueva${Date.now()}Clave`;
    await page.locator('input[name="new-password"]').fill(newPassword);
    await page.locator('input[name="confirm-password"]').fill(newPassword);
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    const check = createClient(URL, ANON_KEY, opts);
    expect((await check.auth.signInWithPassword({ email: user.email, password: user.password })).error).toBeTruthy();
    expect((await check.auth.signInWithPassword({ email: user.email, password: newPassword })).error).toBeNull();

    // Un correo inexistente recibe la misma respuesta (no se revela si existe)
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.goto('/admin/recuperar');
    await page.getByLabel('Correo electrónico').fill(`noexiste-${Date.now()}@bambu.local`);
    await page.getByRole('button', { name: 'Enviar enlace' }).click();
    await expect(page.getByText('Si el correo pertenece a una cuenta')).toBeVisible();
  } finally {
    await deleteUser(user.id);
  }
});

async function acceptInvite(browser, link) {
  const invitee = await (await browser.newContext()).newPage();
  await openEmailLink(invitee, link);
  const pwd = `Invitado${Date.now()}A`;
  await invitee.locator('input[name="new-password"]').fill(pwd);
  await invitee.locator('input[name="confirm-password"]').fill(pwd);
  await invitee.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(invitee).toHaveURL(/\/admin$/);
  await expect(invitee.getByText('Editor', { exact: false }).first()).toBeVisible();
  return invitee;
}

test('Enlace de invitación (como el de create-admin --invite): crea contraseña en otro dispositivo', async ({ browser }) => {
  const email = `invitado-${Date.now()}@bambu.local`;
  const { data, error } = await service.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: 'http://127.0.0.1:5179/admin/restablecer' } });
  expect(error).toBeNull();
  try {
    await service.from('profiles').insert({ id: data.user.id, email, full_name: 'Invitado', role: 'editor', active: true });
    await acceptInvite(browser, data.properties.action_link);
  } finally {
    await deleteUser(data.user.id);
  }
});

test('Invitación desde el panel (función invite-user)', async ({ page, browser }) => {
  const probe = await fetch(`${URL}/functions/v1/invite-user`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5179' } }).catch(() => null);
  test.skip(probe?.status !== 200, 'Función no servida: ejecuta `npx supabase functions serve invite-user`');
  const email = `invitado-${Date.now()}@bambu.local`;
  await uiLogin(page, USERS.admin.email, USERS.admin.password);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/usuarios');
  const form = page.locator('section[aria-labelledby="invite-title"]');
  await form.getByLabel('Correo electrónico').fill(email);
  await form.getByLabel('Nombre completo').fill('Invitado Prueba');
  await form.getByLabel('Rol').selectOption('editor');
  await form.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect.poll(async () => (await service.from('profiles').select('role').eq('email', email).maybeSingle()).data?.role, { timeout: 15000 }).toBe('editor');

  try {
    await acceptInvite(browser, await latestEmailLink(email));
  } finally {
    const id = (await service.from('profiles').select('id').eq('email', email).maybeSingle()).data?.id;
    if (id) await deleteUser(id);
  }
});

test('invite-user rechaza a editores, visitantes y cuentas sin rol', async () => {
  const fn = `${URL}/functions/v1/invite-user`;
  const probe = await fetch(fn, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5179' } }).catch(() => null);
  test.skip(probe?.status !== 200, 'Función no servida');
  const email = `no-debe-${Date.now()}@bambu.local`;
  const call = (token, origin = 'http://127.0.0.1:5179') => fetch(fn, {
    method: 'POST',
    headers: { Origin: origin, apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, full_name: 'X', role: 'admin' }),
  });
  const tokenOf = async kind => (await (await signedIn(kind)).auth.getSession()).data.session.access_token;

  expect((await call(ANON_KEY)).status).toBe(401);                 // visitante anónimo (sin sesión)
  expect((await call('token.falso.firmado')).status).toBe(401);     // token inválido
  expect((await call(await tokenOf('editor'))).status).toBe(403);   // editor
  expect((await call(await tokenOf('outsider'))).status).toBe(403); // cuenta sin rol
  expect((await (await signedIn('editor')).functions.invoke('invite-user', { body: { email } })).error).toBeTruthy();
  // ninguna de las llamadas creó la cuenta
  const { data } = await service.from('profiles').select('id').eq('email', email);
  expect(data).toEqual([]);
});

test('Desactivar a un usuario corta su acceso aunque tenga sesión abierta', async ({ page }) => {
  const user = await createTempUser('editor');
  try {
    const api = createClient(URL, ANON_KEY, opts);
    await api.auth.signInWithPassword({ email: user.email, password: user.password });
    expect((await api.rpc('current_staff_role')).data).toBe('editor');
    await service.from('profiles').update({ active: false }).eq('id', user.id);
    expect((await api.rpc('current_staff_role')).data).toBeNull();
    expect((await api.from('rooms').update({ sort_order: 1 }).eq('number', '01').select()).data).toEqual([]);

    await uiLogin(page, user.email, user.password);
    await expect(page.getByRole('alert')).toContainText('no tiene acceso');
    await page.goto('/admin/habitaciones');
    await expect(page.getByRole('heading', { name: 'Sin acceso al panel' })).toBeVisible();
  } finally {
    await deleteUser(user.id);
  }
});
