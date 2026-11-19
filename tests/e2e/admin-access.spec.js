// Acceso al panel desde el propio sitio: sin escribir rutas a mano. Solo Supabase local.
import { test, expect } from '@playwright/test';
import { ensureUsers, serviceClient, USERS } from '../helpers.js';

const service = serviceClient();

async function fillLogin(page, kind) {
  await page.getByLabel('Correo electrónico').fill(USERS[kind].email);
  await page.locator('input[name="password"]').fill(USERS[kind].password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test.beforeAll(async () => { await ensureUsers(); });

test('Administración en el pie de página: login, panel, volver al sitio y regreso directo con sesión', async ({ page }) => {
  await page.goto('/');
  const footerLink = page.locator('footer').getByRole('link', { name: 'Administración' });
  await expect(footerLink).toBeVisible();
  await footerLink.click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await expect(page.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toBeVisible();

  // Volver al sitio web desde el login
  await page.getByRole('link', { name: /Volver al sitio web/ }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:5179\/$/);

  await page.locator('footer').getByRole('link', { name: 'Administración' }).click();
  await fillLogin(page, 'admin');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Habitaciones' })).toBeVisible();

  // Con sesión abierta, el mismo enlace lleva directo al panel
  await page.goto('/galeria');
  await page.locator('footer').getByRole('link', { name: 'Administración' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
});

test('Administración en el menú móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/habitaciones');
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  const menu = page.locator('#mobile-menu');
  await menu.getByRole('link', { name: 'Administración' }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Cuenta sin rol: acceso denegado con salida al sitio', async ({ page }) => {
  await page.goto('/');
  await page.locator('footer').getByRole('link', { name: 'Administración' }).click();
  await fillLogin(page, 'outsider');
  await expect(page.getByText('Tu cuenta no tiene acceso al panel')).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sin acceso al panel' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Volver al sitio web/ })).toBeVisible();
});

test('Editor de habitación: reservas, solicitudes y bloqueos asociados, y bloqueo prellenado', async ({ page }) => {
  const room = (await service.from('rooms').select('id,number').eq('number', '05').single()).data;
  const start = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
  const end = new Date(Date.now() + 402 * 864e5).toISOString().slice(0, 10);
  const block = (await service.from('room_blocks').insert({ room_id: room.id, start_date: start, end_date: end, reason: 'Prueba E2E pintura' }).select('id').single()).data;
  try {
    await page.goto('/admin/login');
    await fillLogin(page, 'admin');
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto(`/admin/habitaciones/${room.id}`);
    const panel = page.locator('section', { has: page.getByRole('heading', { name: 'Reservas y bloqueos de esta habitación' }) });
    await expect(panel.getByText(/Prueba E2E pintura/)).toBeVisible();
    await panel.getByRole('link', { name: 'Bloquear fechas' }).click();
    await expect(page).toHaveURL(/tab=bloqueos/);
    await expect(page.locator('select[name="room_id"]')).toHaveValue(room.id);
  } finally {
    await service.from('room_blocks').delete().eq('id', block.id);
  }
});
