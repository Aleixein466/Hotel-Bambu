# Hotel Bambú Plaza

Sitio web y panel administrativo del Hotel Bambú Plaza (Mocoa, Putumayo, Colombia).
El propietario administra habitaciones, tarifas, fotografías, textos, publicaciones, solicitudes y reservas
desde un panel protegido. Todo se guarda en PostgreSQL (Supabase) y se refleja en el sitio público sin
tocar código ni volver a desplegar.

- **Sitio público:** `/`, `/habitaciones`, `/habitaciones/01`, `/galeria`, `/novedades`, `/informacion`, `/contacto`
- **Panel administrativo:** enlace **Administración** (candado) en el pie de página, columna "Información",
  y al final del menú móvil. Sin sesión abre el inicio de sesión; con sesión abierta entra directo al panel.
  La ruta (`/admin`) no es secreta: la protección es la autenticación, los roles y las políticas RLS.

## Arquitectura

| Capa | Tecnología | Función |
|---|---|---|
| Frontend | React 19 + Vite + React Router 7 | Sitio público y panel (SPA) |
| Datos remotos | TanStack Query + Supabase JS | Caché, reintentos, invalidación |
| Validación | Zod (formularios) + restricciones SQL y RPC | El servidor siempre valida |
| Autenticación | Supabase Auth (correo/contraseña, recuperación, MFA TOTP) | Sin registro público |
| Base de datos | Supabase PostgreSQL + RLS | Fuente única de verdad |
| Imágenes | Supabase Storage (bucket `media`, lectura pública, escritura solo personal) | Rutas inmutables |
| Sincronización | Supabase Realtime sobre `public_revisions` | Visitantes ven cambios sin recargar |

```
Visitante ──► vistas public_* (solo contenido publicado) ──┐
          └─► submit_booking_request() (validado, limitado) │   PostgreSQL
Panel ─────► tablas con RLS (admin / editor) ───────────────┤   (RLS, triggers,
          └─► RPC publish_*, confirm_booking_request…       │    auditoría)
Triggers ──► public_revisions ──Realtime──► navegadores abiertos invalidan su caché
```

**Seguridad (resumen):**
- Visitantes (clave `anon`): solo leen vistas `public_*` con columnas seguras y contenido publicado; no tienen
  permisos sobre ninguna tabla. Pueden enviar solicitudes únicamente vía `submit_booking_request`, que valida
  fechas, capacidad, disponibilidad real, consentimiento, trampa anti-spam y límites (5/h por IP, 3/día por
  teléfono, 120/h global).
- Rol `editor`: habitaciones (sin crear ni desactivar), fotografías, galería, textos y publicaciones.
  No ve datos de huéspedes, configuración, usuarios ni auditoría.
- Rol `admin`: todo, incluido solicitudes, reservas, bloqueos, configuración, usuarios y registro de actividad.
- El rol se comprueba en PostgreSQL (`current_staff_role()`), no en el navegador. Si un usuario activa MFA, sus
  permisos exigen sesión verificada en dos pasos (AAL2).
- Reservas: restricción de exclusión `reservations_no_overlap` (GiST) impide dos reservas activas superpuestas
  en la misma habitación aunque lleguen en paralelo; los bloqueos se validan con bloqueo de fila por habitación.
  Rango `[entrada, salida)`: la salida de una reserva puede coincidir con la entrada de otra (configurable).
- Una solicitud **nunca** se convierte sola en reserva: requiere "Confirmar" de un administrador.
- Auditoría automática (`audit_logs`) de quién cambió qué y cuándo; en tablas con datos personales solo se
  registran identificadores y estados.
- Habitaciones y reservas no se borran (historial); se ocultan, desactivan o cancelan. Publicaciones: papelera
  con restauración.
- Imágenes: se validan tipo (JPG/PNG/WebP), tamaño (≤ 15 MB) y dimensiones (≥ 400 px), se optimizan a WebP
  (≤ 2000 px) con miniatura y sin metadatos EXIF/GPS. Cada archivo tiene una ruta única: reemplazar una foto crea
  una URL nueva, por lo que la caché nunca muestra la anterior. No se puede borrar una imagen en uso.

### Borradores y publicación

Habitaciones, publicaciones y bloques de contenido tienen versión publicada + borrador. "Guardar borrador" no
afecta al sitio; "Publicar cambios" aplica el borrador y el sitio se actualiza al instante. Las fotografías de
cada habitación, el estado operativo (disponible / mantenimiento / inactiva) y la visibilidad se aplican
inmediatamente. "Ocupada" se calcula a partir de las reservas, no se marca a mano.

## Desarrollo local

Requisitos: Node 20+, Docker Desktop.

```powershell
npm ci
npx supabase start            # levanta Postgres, Auth, Storage, Realtime y Mailpit locales
npx supabase db reset         # aplica supabase/migrations/*.sql
copy .env.example .env.development.local  # URL y "anon key" que muestra `npx supabase status`
npm run dev                   # http://127.0.0.1:5173
```

> **Desarrollo y producción separados.** `.env.development.local` (Supabase local) lo usa `npm run dev`;
> `.env.production.local` (producción, solo clave pública) lo usan `npm run build`, `preview` y `smoke:prod`.
> No uses `.env.local`: se carga en todos los modos. Si `npm run dev` apunta a un Supabase remoto, la terminal
> muestra una advertencia en rojo. Las pruebas E2E siempre usan Supabase local en el puerto 5179.

Crear un administrador local (la contraseña se pide de forma oculta):

```powershell
$env:SUPABASE_URL="http://127.0.0.1:54321"; $env:SUPABASE_SERVICE_ROLE_KEY="<service_role de supabase status>"
npm run create-admin -- --email tu@correo.com --name "Tu nombre" --role admin
```

Los correos de recuperación locales se ven en Mailpit: http://127.0.0.1:54324

## Pruebas

| Comando | Qué verifica |
|---|---|
| `npm run lint` | ESLint |
| `npm run build` | Compilación de producción |
| `npm run test:unit` | WhatsApp (`wa.me`, codificación), fechas, solapamientos, slugs |
| `npm run test:db` | Contra Supabase local: RLS, visitantes sin acceso a datos personales, validaciones del servidor, concurrencia de confirmaciones, bloqueos, límites, publicación/ocultación, papelera, permisos de editor, auditoría |
| `npm run test:e2e` | Navegador (Playwright): enlace **Administración** en pie de página y menú móvil, acceso denegado sin rol, reservas/bloqueos desde el editor de habitación, protección de `/admin`, login/logout, MFA (TOTP real), recuperación e invitación por correo (Mailpit) abiertas en otro dispositivo, revocación de acceso, edición de habitación visible en otra sesión, publicaciones, imágenes, solicitudes y confirmación |

Las pruebas de BD y E2E crean usuarios de prueba **solo** en Supabase local y se niegan a correr contra un
proyecto remoto. Antes de E2E: `npx playwright install chromium`. La prueba de invitación desde el panel
requiere `npx supabase functions serve invite-user` (si no está servida, se omite y lo indica).

`npm run smoke:prod` revisa producción **en solo lectura** con la clave pública: sin `SITE_URL` comprueba
solo Supabase (útil antes de desplegar el sitio); con `SITE_URL` también HTTPS, cabeceras y rutas.

## Producción (paso a paso)

Ningún paso requiere poner credenciales en archivos del repositorio. Las claves privadas solo se usan en
variables de entorno temporales de tu terminal o en los paneles de Supabase y del hosting.

### 1. Crear el proyecto de Supabase
1. En https://supabase.com crea una organización y un proyecto (región recomendada: `sa-east-1`, São Paulo).
   Guarda la contraseña de la base de datos en un gestor de contraseñas.
2. En **Project Settings → API** anota: `Project URL`, la clave **anon/publishable** (pública) y la
   **service_role/secret** (privada: no la copies a ningún archivo).

### 2. Aplicar la base de datos
```powershell
npx supabase login                         # abre el navegador; no guarda nada en el repo
npx supabase link --project-ref <ref>      # <ref> es el identificador del proyecto (en la URL)
npx supabase db push                       # aplica supabase/migrations en orden
```
Migraciones (reproducibles, en orden):
- `20261118000100_schema.sql` — tablas, restricciones, índices, `updated_at`.
- `20261118000200_logic.sql` — reglas de negocio, disponibilidad, auditoría, publicación, solicitudes, indicadores.
- `20261118000300_security.sql` — RLS, permisos, vistas públicas, Realtime, bucket y políticas de Storage.
- `20261118000400_initial_data.sql` — las 16 habitaciones, fotos reales incluidas, galería y textos actuales.
- `20261118000500_review_fixes.sql` — correcciones de la revisión de seguridad.

El **Security Advisor** de Supabase mostrará avisos "Security Definer View" para las vistas `public_*`.
Son intencionales: son la única puerta de lectura para visitantes y filtran explícitamente solo contenido
publicado y columnas seguras (los visitantes no tienen permisos sobre ninguna tabla).

Comprueba en **Database → Publications** que `supabase_realtime` incluye `public_revisions`, y en
**Storage** que existe el bucket `media` (público, 10 MB, solo imágenes).

### 3. Configurar Authentication (panel de Supabase)
1. **Sign In / Providers → Email**: desactiva *Allow new users to sign up*; activa *Secure password change*;
   deja *Confirm email* activado.
2. **Sign In / Providers → Passwords**: longitud mínima 10; requisitos: minúsculas, mayúsculas y dígitos.
   Opcional: *Prevent use of leaked passwords*.
3. **URL Configuration**: *Site URL* = `https://tu-dominio`; en *Redirect URLs* agrega
   `https://tu-dominio/admin/restablecer` (y `https://www.tu-dominio/admin/restablecer` si usas www).
   Los enlaces de recuperación e invitación funcionan aunque se abran en otro dispositivo.
4. **Multi-Factor**: habilita *TOTP (App Authenticator)*. Cada administrador lo activa en **Panel → Mi cuenta**.
5. **Rate Limits**: revisa el límite de inicios de sesión por IP; opcional en **Attack Protection**: CAPTCHA
   (Cloudflare Turnstile o hCaptcha).
6. **SMTP Settings**: configura un SMTP propio (p. ej. el correo del dominio o un servicio transaccional). Sin
   SMTP propio Supabase solo envía unos pocos correos por hora y la recuperación/invitación puede no llegar.
7. **Email Templates** (obligatorio): en *Invite user* y *Reset password* pega el asunto y el HTML de
   `supabase/templates/invite.html` y `supabase/templates/recovery.html` (asuntos en `supabase/config.toml`).
   Estas plantillas usan `token_hash`: el token de un solo uso solo se canjea cuando la persona pulsa
   "Continuar" en el sitio, de modo que los filtros de correo que abren enlaces automáticamente
   (Outlook/Defender, antivirus) no lo invalidan. El enlace clásico sigue funcionando como respaldo.

> **No uses `supabase config push`** contra producción: `supabase/config.toml` contiene valores de desarrollo
> local (por ejemplo `site_url = http://127.0.0.1:5173`). Configura Authentication desde el panel.

### 4. Función de invitaciones
```powershell
npx supabase secrets set ALLOWED_ORIGIN=https://tu-dominio,https://www.tu-dominio
npx supabase functions deploy invite-user
```
`ALLOWED_ORIGIN` es obligatorio en producción: la función rechaza (403) peticiones de otros orígenes.
`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente.

### 5. Primer administrador
En tu computador, en una terminal nueva (las variables desaparecen al cerrarla):
```powershell
$env:SUPABASE_URL="https://<ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<pega aquí la service_role; no la guardes en archivos>"
npm run create-admin -- --email propietario@dominio.com --name "Nombre" --role admin --invite --redirect https://tu-dominio/admin/restablecer
Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY
```
El propietario recibe un correo, define su contraseña en `/admin/restablecer` y entra en `/admin`.
Los siguientes usuarios se invitan desde **Panel → Usuarios**.

### 6. Frontend
Variables de entorno de compilación en el hosting (ver `.env.example`):
`VITE_SUPABASE_URL=https://<ref>.supabase.co` y `VITE_SUPABASE_ANON_KEY=<anon/publishable>`.
**Nunca** pongas la service_role en una variable `VITE_` (quedaría pública en el navegador).
- **Vercel:** importa el repositorio; `vercel.json` define el fallback SPA, CSP y cabeceras de seguridad.
- **Netlify / Cloudflare Pages:** build `npm run build`, carpeta `dist`; usa `public/_redirects` y `public/_headers`.
- La CSP permite `https://*.supabase.co`. Si usas un dominio personalizado de Supabase, agrégalo a
  `img-src` y `connect-src` (también como `wss://`) en `vercel.json` y `public/_headers`.
- Comprueba localmente la CSP con `npm run build && npm run preview`.

### 7. Verificación después del despliegue
Primero, la verificación automática de **solo lectura** (solo usa datos públicos; no escribe nada):
```powershell
$env:SITE_URL="https://tu-dominio"   # VITE_SUPABASE_* se leen de .env.production.local
npm run smoke:prod
```
Comprueba HTTPS, CSP/HSTS, rutas SPA, contenido público, que los visitantes no lean tablas privadas ni
ejecuten funciones administrativas, registro público desactivado, bucket, Realtime y `ALLOWED_ORIGIN`.

Después, manualmente y desde **dos navegadores o dispositivos distintos**:
1. `https://tu-dominio/admin` redirige a `/admin/login`.
2. Inicia sesión, activa MFA en **Mi cuenta**, cierra sesión y vuelve a entrar con el código.
3. En **Configuración** registra WhatsApp, teléfono, correo y dirección; compruébalos en `/contacto`.
4. Cambia el precio de una habitación, publícalo y ábrela desde el celular.
5. Envía una solicitud de prueba desde el sitio, confírmala o recházala en **Solicitudes** y luego cancélala.
6. Prueba "¿Olvidaste tu contraseña?" para confirmar que el SMTP entrega los correos.

Después del despliegue, los cambios de contenido no requieren volver a desplegar.

## Fotografías

- `public/assets/hotel`: 15 fotografías WebP (y miniaturas) aprobadas para el sitio, registradas en la base como
  recursos "incluidos". Ninguna tiene metadatos EXIF/GPS.
- Las 38 fotografías originales **no están en el repositorio ni se publican**: se guardan localmente en
  `fotos-originales/` (ignorada por Git). Dos de ellas muestran a una persona identificable.
- La foto de recepción se retiró del sitio porque mostraba personas y el monitor de las cámaras de seguridad.
  Queda en `fotos-originales/excluidas-del-sitio/`.
- `scripts/process_photos.py` regenera las WebP desde `fotos-originales/`.
- Las fotos nuevas se suben desde **Panel → Fotografías** (se optimizan a WebP y se eliminan metadatos). Una
  imagen marcada como "ilustrativa" muestra la etiqueta "Imagen ilustrativa" para no presentarla como foto real.
- Antes de publicar fotos con personas, obtén su autorización.

## Pendiente de datos oficiales

Lo que el sitio no inventa y el propietario debe completar desde el panel:

- Número oficial de WhatsApp, teléfono, correo, dirección exacta y enlace de mapa (**Configuración**).
- Tarifas por noche, tipo, capacidad y descripción confirmados de cada una de las 16 habitaciones
  (se muestran como "por confirmar" hasta marcarlas como verificadas).
- Políticas de reserva, horarios de check-in/check-out, preguntas frecuentes, misión y visión.
- Asignación de fotografías reales por habitación.
- No hay pasarela de pagos: el sitio no registra pagos ni ingresos.
