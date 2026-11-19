import { defineConfig } from '@playwright/test';
import { URL as SUPABASE_URL, ANON_KEY } from './tests/helpers.js';

// Las pruebas E2E escriben datos (solicitudes, habitaciones, fotos). El servidor de pruebas se arranca
// SIEMPRE contra el Supabase local: las variables de proceso tienen prioridad sobre .env.local en Vite,
// así que aunque .env.local apunte a producción, el navegador de pruebas nunca lo hará.
// tests/helpers.js ya se niega a continuar si la URL no es local.

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:5179', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5179 --strictPort',
    url: 'http://127.0.0.1:5179',
    // Nunca reutilizar un servidor ya abierto: podría estar apuntando a producción.
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_SUPABASE_URL: SUPABASE_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY },
  },
  reporter: 'list',
});
