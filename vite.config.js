import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// La misma CSP que vercel.json / public/_headers, con el origen de Supabase configurado,
// para verificarla localmente con `npm run build && npm run preview`.
function csp(supabaseUrl) {
  const api = supabaseUrl || 'https://*.supabase.co';
  const ws = api.replace(/^http/, 'ws');
  return [
    "default-src 'self'", "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${api}`, `connect-src 'self' ${api} ${ws}`,
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
  ].join('; ');
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // Desarrollo debe usar Supabase LOCAL (.env.development.local). Si apunta a otro lugar, avisar fuerte:
  // todo lo que se haga en el navegador escribiría en esa base.
  if (command === 'serve' && env.VITE_SUPABASE_URL && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(env.VITE_SUPABASE_URL)) {
    console.warn(`\n\x1b[41m\x1b[37m  ATENCIÓN: npm run dev está conectado a ${new URL(env.VITE_SUPABASE_URL).host} (no es Supabase local).  \x1b[0m\n` +
      '  Los cambios que hagas en el panel modificarán esa base. Para desarrollo usa .env.development.local.\n');
  }
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 5173 },
    preview: { host: '127.0.0.1', port: 4173, headers: { 'Content-Security-Policy': csp(env.VITE_SUPABASE_URL) } },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  };
});
