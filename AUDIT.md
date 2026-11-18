# Auditoría y transformación a plataforma

Fecha: 18 de noviembre de 2026. Rama: `redesign/premium-hotel-bambu` (sin otras ramas remotas con backend).

## Estado encontrado (Fase 0)

| Área | Hallazgo | Gravedad |
|---|---|---|
| Arquitectura | `src/main.jsx` solo montaba `src/legacy.js`, que generaba toda la interfaz con cadenas HTML y un router por hash. Sin backend, sin base de datos. | Crítica |
| Habitaciones | 16 fichas generadas por fórmula (tipo/capacidad/foto), editables solo en `localStorage`. | Alta |
| Panel | `#admin` accesible sin autenticación; "Administrador demo"; calendario conceptual. | Crítica |
| Contenido y contacto | Textos, WhatsApp, dirección y correo guardados en `localStorage` del navegador que editaba. | Alta |
| Solicitudes | Se "guardaban" en `localStorage` y se copiaba un mensaje; sin disponibilidad real ni persistencia. | Alta |
| Dependencias | Versiones `latest` (no reproducibles); sin `vite.config.js`, sin lint. | Media |
| Fotografías | 16 WebP reales derivados de 38 JPEG originales (se conservan). Las imágenes conceptuales ya no se usaban. | — |

## Qué se hizo

- Backend Supabase con migraciones versionadas (`supabase/migrations`): esquema, reglas de negocio, RLS, vistas públicas, Storage, Realtime y datos iniciales (las 16 habitaciones conservan número e identidad; tarifas vacías; tipo/capacidad marcados como "por confirmar").
- Frontend reescrito en componentes React con React Router y TanStack Query, conservando el diseño (`src/styles.css`). `legacy.js`/`home.js` eliminados.
- Panel en `/admin` con login real, recuperación de contraseña, MFA TOTP, roles admin/editor, gestión de habitaciones, fotografías, galería, contenidos, publicaciones, solicitudes, reservas, bloqueos, calendario, configuración, usuarios y registro de actividad.
- Sincronización en vivo: los visitantes con la página abierta reciben los cambios publicados sin recargar.

## Verificación

Ver la sección **Pruebas** del README. Resultados de la última ejecución local:
`npm run lint` sin errores · `npm run build` correcto · `npm audit` 0 vulnerabilidades · unitarias 7/7 ·
base de datos 21/21 · E2E 13/13 (incluye MFA con TOTP real, recuperación e invitación por correo abiertas en
otro navegador, invitación desde el panel y revocación de acceso). `supabase db lint`: sin errores.

## Auditoría de integración y preparación para producción

- `zod` 3 → 4 (vulnerabilidad alta).
- Flujo de sesión PKCE → implícito: los enlaces de invitación/recuperación fallaban al abrirse en otro dispositivo.
- Plantillas de correo con `token_hash` (`supabase/templates`): el token se canjea solo al pulsar "Continuar",
  así los escáneres de correo no lo consumen.
- CSP y HSTS en `vercel.json` y `public/_headers`; `ALLOWED_ORIGIN` obligatorio en la función `invite-user`.
- `create-admin --invite` exige `--redirect` explícito.
- Las pruebas leen las claves locales de `supabase status` (sin claves en el código).
- `npm run smoke:prod`: verificación de solo lectura del entorno desplegado.
- Fotografías: las 38 originales salen del repositorio (`fotos-originales/`, ignorada); la foto de recepción se
  retiró del sitio y de la migración inicial (personas y monitor de seguridad visibles).

Pendiente: conexión al Supabase de producción, SMTP propio, despliegue de la función y del sitio, y la
verificación en el entorno desplegado. La plataforma no se declara lista para producción hasta entonces.
