// Pruebas de extremo a extremo contra Supabase local + Vite. Cada prueba deja los datos como estaban.
import { test, expect } from '@playwright/test';
import { ensureUsers, isoDaysFromToday, randomOffset, resetRateLimits, serviceClient, USERS } from '../helpers.js';

const service = serviceClient();
let room01;

async function login(page, kind = 'admin') {
  await page.goto('/admin/login');
  await page.getByLabel('Correo electrónico').fill(USERS[kind].email);
  await page.locator('input[name="password"]').fill(USERS[kind].password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Habitaciones' })).toBeVisible();
}

test.beforeAll(async () => {
  await ensureUsers();
  room01 = (await service.from('rooms').select('*').eq('number', '01').single()).data;
});

test.afterAll(async () => {
  // Restaurar la habitación 01 tal como estaba
  const { id, name, description, price_cop, cover_media_id, publish_status, details_confirmed } = room01;
  await service.from('rooms').update({ name, description, price_cop, cover_media_id, publish_status, details_confirmed, draft: null }).eq('id', id);
});

test('A — /admin y sus subrutas exigen sesión', async ({ page }) => {
  for (const path of ['/admin', '/admin/solicitudes', '/admin/configuracion', '/admin/habitaciones/nueva']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin\/login$/);
  }
});

test('B — credenciales incorrectas, inicio y cierre de sesión', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('Correo electrónico').fill(USERS.admin.email);
  await page.locator('input[name="password"]').fill('ClaveIncorrecta123');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
  await expect(page).toHaveURL(/\/admin\/login$/);

  await page.locator('input[name="password"]').fill(USERS.admin.password);
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(page.locator('input[name="password"]')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/); // el cierre termina y redirige
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('auth-token')))).toEqual([]);
  await page.goto('/admin/reservas');
  await expect(page).toHaveURL(/\/admin\/login$/);
});

test('editor no accede a secciones de administrador', async ({ page }) => {
  await login(page, 'editor');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Solicitudes' })).toHaveCount(0);
  await page.goto('/admin/solicitudes');
  await expect(page.getByRole('heading', { name: 'Solo administradores' })).toBeVisible();
});

test('C/F — cambio de tarifa y descripción visible en otra sesión y persistente', async ({ page, browser }) => {
  const price = 70000 + Math.floor(Math.random() * 900) * 100;
  const description = `Habitación renovada, prueba ${Date.now()}.`;
  await login(page);
  await page.goto(`/admin/habitaciones/${room01.id}`);
  await page.locator('input[name="price_cop"]').fill(String(price));
  await page.locator('textarea[name="description"]').fill(description);
  await page.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(page.getByText('Borrador sin publicar').first()).toBeVisible();

  // Un visitante (otro contexto, sin sesión) aún ve la versión publicada
  const visitor = await browser.newContext();
  const pub = await visitor.newPage();
  await pub.goto('/habitaciones/01');
  await expect(pub.getByText(description)).toHaveCount(0);

  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText('Borrador sin publicar')).toHaveCount(0);

  // Sin recargar: Realtime invalida la caché del visitante
  const formatted = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(price);
  await expect(pub.getByText(description)).toBeVisible({ timeout: 15000 });
  await expect(pub.getByText(formatted).first()).toBeVisible();

  // Persistencia: navegador nuevo
  const fresh = await browser.newContext();
  const again = await fresh.newPage();
  await again.goto('/habitaciones');
  await expect(again.locator('.room-card').filter({ hasText: 'Habitación 01' })).toContainText(formatted);
  await visitor.close();
  await fresh.close();
});

test('D — publicación: crear, publicar, editar, despublicar', async ({ page, browser }) => {
  const title = `Promoción prueba ${Date.now()}`;
  await login(page);
  await page.goto('/admin/publicaciones/nueva');
  await page.getByLabel('Título').fill(title);
  await page.getByLabel('Tipo').selectOption('promotion');
  await page.getByLabel('Resumen').fill('Primera versión');
  await page.getByLabel(/^Texto/).fill('Párrafo uno.\n\nPárrafo dos.');
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page).toHaveURL(/\/admin\/publicaciones\/[0-9a-f-]{36}$/);
  const slug = await page.getByLabel('Enlace (slug)').inputValue();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/novedades');
  await expect(visitor.locator('.post-card').filter({ hasText: title })).toBeVisible();
  await visitor.goto(`/novedades/${slug}`);
  await expect(visitor.getByText('Párrafo dos.')).toBeVisible();

  await page.getByLabel('Resumen').fill('Segunda versión');
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByText('Borrador sin publicar')).toHaveCount(0);
  await visitor.goto('/novedades');
  await expect(visitor.locator('.post-card').filter({ hasText: title })).toContainText('Segunda versión');

  await page.getByRole('button', { name: 'Despublicar' }).click();
  const dialog = page.getByRole('alertdialog');
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button').last().click();
  await expect.poll(async () => (await service.from('posts').select('status').eq('slug', slug).single()).data.status).toBe('unpublished');
  await visitor.goto('/novedades');
  await expect(visitor.locator('.post-card').filter({ hasText: title })).toHaveCount(0);
  await visitor.goto(`/novedades/${slug}`);
  await expect(visitor.getByText('Esta publicación no está disponible')).toBeVisible();

  await service.from('posts').delete().eq('slug', slug);
});

test('E — subir, asignar y reemplazar imagen sin versión anterior en caché', async ({ page, browser }) => {
  await login(page);
  const uploaded = [];
  for (const file of ['public/assets/hotel/habitacion-doble.webp', 'public/assets/hotel/habitacion-camas.webp']) {
    await page.goto('/admin/medios');
    const before = (await service.from('media_assets').select('id').eq('source', 'storage')).data.length;
    await page.getByTestId('media-file-input').first().setInputFiles(file);
    await expect.poll(async () => (await service.from('media_assets').select('id').eq('source', 'storage')).data.length, { timeout: 20000 }).toBe(before + 1);
    uploaded.push((await service.from('media_assets').select('*').eq('source', 'storage').order('created_at', { ascending: false }).limit(1).single()).data);
  }

  const visitor = await (await browser.newContext()).newPage();
  for (const media of uploaded) {
    await page.goto(`/admin/habitaciones/${room01.id}`);
    await page.getByRole('button', { name: /^(Cambiar|Elegir) imagen$/ }).first().click();
    const picker = page.getByRole('dialog');
    await picker.locator('.media-option').filter({ has: page.locator(`img[src*="${media.thumb_path}"]`) }).click();
    await picker.getByRole('button', { name: 'Usar imagen' }).click();
    await page.getByRole('button', { name: 'Publicar cambios' }).click();
    await expect(page.getByText('Borrador sin publicar')).toHaveCount(0);

    await visitor.goto('/habitaciones');
    const card = visitor.locator('.room-card').filter({ hasText: 'Habitación 01' });
    await expect(card.locator(`img[src*="${media.thumb_path}"]`)).toBeVisible();
    // La URL nueva responde y es distinta de la anterior (rutas inmutables)
    const src = await card.locator('img').first().getAttribute('src');
    expect((await visitor.request.get(src)).ok()).toBe(true);
  }
  const card = visitor.locator('.room-card').filter({ hasText: 'Habitación 01' });
  await expect(card.locator(`img[src*="${uploaded[0].path.replace('.webp', '')}"]`)).toHaveCount(0);

  // Limpieza: restaurar portada, borrar recursos
  await service.from('rooms').update({ cover_media_id: room01.cover_media_id }).eq('id', room01.id);
  for (const media of uploaded) {
    await service.from('media_assets').delete().eq('id', media.id);
    await service.storage.from('media').remove([media.path, media.thumb_path]);
  }
});

test('G — solicitud pública, confirmación y rechazo de superposición', async ({ page, browser }) => {
  resetRateLimits();
  const d = randomOffset();
  const checkIn = isoDaysFromToday(d), checkOut = isoDaysFromToday(d + 2);
  const roomId = (await service.from('rooms').select('id').eq('number', '03').single()).data.id;

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto('/habitaciones/03');
  await visitor.getByRole('button', { name: /Consultar/ }).first().click();
  const form = visitor.locator('#booking-form');
  await form.locator('[name="room"]').selectOption(roomId);
  await form.locator('[name="checkin"]').fill(checkIn);
  await form.locator('[name="checkout"]').fill(checkOut);
  await form.locator('[name="guests"]').selectOption('1');
  await visitor.getByRole('button', { name: 'Continuar' }).click();
  await form.locator('[name="guestName"]').fill('Huésped E2E');
  await form.locator('[name="phone"]').fill(`320${Math.floor(1e6 + Math.random() * 8e6)}`);
  await form.locator('[name="consent"]').check();
  await visitor.getByRole('button', { name: 'Continuar' }).click();
  await visitor.getByRole('button', { name: 'Enviar solicitud' }).click();
  const code = (await visitor.getByTestId('booking-code').textContent()).trim();
  expect(code).toMatch(/^BP-/);
  await expect(visitor.getByText('no una reserva confirmada')).toBeVisible();

  // Segunda solicitud superpuesta (aún no hay reserva, así que se admite como pendiente)
  const second = await service.rpc('submit_booking_request', { p_room_id: roomId, p_check_in: isoDaysFromToday(d + 1), p_check_out: isoDaysFromToday(d + 3), p_guests: 1, p_guest_name: 'Otra persona', p_phone: '3109998877', p_consent: true });
  expect(second.error).toBeNull();

  await login(page);
  await page.goto('/admin/solicitudes');
  const row = page.locator(`tr[data-request-code="${code}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Confirmar' }).click();
  const dialog = page.getByRole('alertdialog');
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button').last().click();
  await expect.poll(async () => (await service.from('booking_requests').select('status').eq('code', code).single()).data.status).toBe('confirmed');

  const row2 = page.locator(`tr[data-request-code="${second.data[0].code}"]`);
  await row2.getByRole('button', { name: 'Confirmar' }).click();
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button').last().click();
  await expect(page.getByText(/superpone/).first()).toBeVisible();
  expect((await service.from('booking_requests').select('status').eq('code', second.data[0].code).single()).data.status).toBe('pending');

  // Limpieza
  const ids = (await service.from('booking_requests').select('id').in('code', [code, second.data[0].code])).data.map(r => r.id);
  await service.from('booking_requests').update({ reservation_id: null }).in('id', ids);
  await service.from('reservations').delete().in('request_id', ids);
  await service.from('booking_requests').delete().in('id', ids);
});

test('sitio público sin errores ni desbordamiento horizontal', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/', '/habitaciones', '/habitaciones/01', '/galeria', '/novedades', '/informacion', '/contacto']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${path} @ ${width}px`).toBe(false);
    }
  }
  await page.goto('/galeria');
  await expect(page.getByRole('heading', { name: 'Así se ve Bambú Plaza.' })).toBeVisible();
  expect(errors).toEqual([]);
});
