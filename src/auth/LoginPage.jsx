import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from './AuthProvider.jsx';
import { BrandMark } from '../ui/Brand.jsx';

// Freno progresivo en el navegador; el límite real lo aplica Supabase Auth por IP (config.toml / panel).
const LOCK_KEY = 'bambu-login-lock';
function readLock() {
  try { return JSON.parse(sessionStorage.getItem(LOCK_KEY) || '{"fails":0,"until":0}'); } catch { return { fails: 0, until: 0 }; }
}
function writeLock(value) { try { sessionStorage.setItem(LOCK_KEY, JSON.stringify(value)); } catch { /* sin almacenamiento */ } }

export function AuthLayout({ title, children }) {
  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <Link className="brand auth-brand" to="/" aria-label="Volver al sitio"><BrandMark /><span className="brand-copy"><strong>Hotel Bambú</strong><small>PANEL ADMINISTRATIVO</small></span></Link>
        <h1 id="auth-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function PasswordField({ label = 'Contraseña', name = 'password', autoComplete = 'current-password', value, onChange, minLength }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="auth-field">{label}
      <span className="password-field">
        <input name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required minLength={minLength}
          value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" className="button button-ghost" onClick={() => setVisible(v => !v)}
          aria-pressed={visible} aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{visible ? 'Ocultar' : 'Mostrar'}</button>
      </span>
    </label>
  );
}

export default function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from && location.state.from.startsWith('/admin') ? location.state.from : '/admin';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lock = readLock();
  const locked = lock.until > now;

  useEffect(() => {
    if (!locked) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);

  if (auth.status === 'staff') return <Navigate to={from} replace />;

  async function handleLogin(event) {
    event.preventDefault();
    if (locked || busy) return;
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) {
      const fails = lock.fails + 1;
      writeLock({ fails, until: fails >= 3 ? Date.now() + Math.min(300, 5 * 2 ** (fails - 3)) * 1000 : 0 });
      setNow(Date.now());
      setError(err.status === 429
        ? 'Demasiados intentos. Espera unos minutos antes de volver a intentarlo.'
        : err.status === 400 || /invalid/i.test(err.message) ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión. Revisa tu conexión.');
      return;
    }
    writeLock({ fails: 0, until: 0 });
    setPassword('');
    await auth.refresh();
  }

  async function handleMfa(event) {
    event.preventDefault();
    setBusy(true); setError('');
    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find(f => f.status === 'verified');
    if (listErr || !factor) { setBusy(false); setError('No se encontró un método de verificación. Contacta al administrador.'); return; }
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    setBusy(false);
    if (err) { setError('Código incorrecto o vencido. Usa el código actual de tu aplicación.'); return; }
    await auth.refresh();
    navigate(from, { replace: true });
  }

  if (auth.status === 'needsMfa') {
    return (
      <AuthLayout title="Verificación en dos pasos">
        <form className="auth-form" onSubmit={handleMfa} noValidate>
          <p>Escribe el código de 6 dígitos de tu aplicación de autenticación.</p>
          <label className="auth-field">Código
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verificando…' : 'Verificar'}</button>
          <button className="button button-ghost" type="button" onClick={auth.signOut}>Cancelar y salir</button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Iniciar sesión">
      <form className="auth-form" onSubmit={handleLogin} noValidate>
        <label className="auth-field">Correo electrónico
          <input name="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </label>
        <PasswordField value={password} onChange={setPassword} />
        {auth.status === 'noAccess' && <p className="form-error" role="alert">Tu cuenta no tiene acceso al panel. <button type="button" className="link-button" onClick={auth.signOut}>Cerrar sesión</button></p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {locked && <p className="form-error" role="status">Por seguridad, espera {Math.ceil((lock.until - now) / 1000)} s antes de intentarlo otra vez.</p>}
        <button className="button button-primary" type="submit" disabled={busy || locked || !email || !password}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
        <Link className="text-link" to="/admin/recuperar">¿Olvidaste tu contraseña?</Link>
      </form>
      <p className="fine-print">Acceso exclusivo para personal autorizado del hotel. No hay registro público.</p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/admin/restablecer` });
    setBusy(false);
    // Mensaje neutro: no revela si el correo existe. Solo se informa error de límite o conexión.
    if (err && err.status === 429) { setError('Ya se envió un correo hace poco. Espera un minuto e inténtalo de nuevo.'); return; }
    if (err && !err.status) { setError('No hay conexión con el servidor.'); return; }
    setSent(true);
  }

  return (
    <AuthLayout title="Recuperar contraseña">
      {sent ? (
        <div className="auth-form" role="status">
          <p>Si el correo pertenece a una cuenta del panel, recibirás un enlace para crear una nueva contraseña. Revisa también la carpeta de spam.</p>
          <Link className="button button-ghost" to="/admin/login">Volver al inicio de sesión</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="auth-field">Correo electrónico
            <input name="email" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy || !email}>{busy ? 'Enviando…' : 'Enviar enlace'}</button>
          <Link className="text-link" to="/admin/login">Volver</Link>
        </form>
      )}
    </AuthLayout>
  );
}

export function passwordProblem(password, confirm) {
  if (password.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) return 'Incluye mayúsculas, minúsculas y números.';
  if (password !== confirm) return 'Las contraseñas no coinciden.';
  return '';
}

export function ResetPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const tokenHash = params.get('token_hash');
  const linkType = params.get('type') === 'invite' ? 'invite' : 'recovery';

  // Enlaces con token_hash (plantillas de correo de supabase/templates): el token de un solo uso solo se
  // canjea cuando la persona pulsa el botón, así los escáneres de correo que abren enlaces no lo consumen.
  async function redeem() {
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: linkType });
    setBusy(false);
    if (err) { setError('El enlace venció o ya fue usado. Solicita uno nuevo.'); return; }
    navigate('/admin/restablecer', { replace: true });
  }

  if (tokenHash) {
    return (
      <AuthLayout title={linkType === 'invite' ? 'Bienvenido al panel' : 'Restablecer contraseña'}>
        <p>{linkType === 'invite' ? 'Acepta la invitación para crear tu contraseña.' : 'Continúa para crear una nueva contraseña.'}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="button" onClick={redeem} disabled={busy}>{busy ? 'Validando…' : 'Continuar'}</button>
        {error && <Link className="text-link" to="/admin/recuperar">Solicitar un enlace nuevo</Link>}
      </AuthLayout>
    );
  }

  if (auth.status === 'loading') return <AuthLayout title="Nueva contraseña"><p role="status">Validando enlace…</p></AuthLayout>;
  // Con MFA, Supabase exige AAL2 para cambiar la contraseña: primero se verifica el código.
  if (auth.status === 'needsMfa') return <Navigate to="/admin/login" replace state={{ from: '/admin/restablecer' }} />;
  if (!auth.session) {
    return (
      <AuthLayout title="Enlace no válido">
        <p>El enlace de recuperación venció o ya fue usado. Solicita uno nuevo.</p>
        <Link className="button button-primary" to="/admin/recuperar">Solicitar enlace</Link>
      </AuthLayout>
    );
  }

  async function submit(event) {
    event.preventDefault();
    const problem = passwordProblem(password, confirm);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(err.code === 'same_password' ? 'La nueva contraseña debe ser diferente de la anterior.' : err.code === 'weak_password' ? 'La contraseña es demasiado débil.' : 'No se pudo actualizar la contraseña. Solicita un nuevo enlace.'); return; }
    await auth.refresh();
    navigate('/admin', { replace: true });
  }

  return (
    <AuthLayout title="Nueva contraseña">
      <form className="auth-form" onSubmit={submit} noValidate>
        <PasswordField label="Nueva contraseña" name="new-password" autoComplete="new-password" value={password} onChange={setPassword} minLength={10} />
        <PasswordField label="Confirmar contraseña" name="confirm-password" autoComplete="new-password" value={confirm} onChange={setConfirm} minLength={10} />
        <p className="fine-print">Mínimo 10 caracteres, con mayúsculas, minúsculas y números.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar contraseña'}</button>
      </form>
    </AuthLayout>
  );
}
