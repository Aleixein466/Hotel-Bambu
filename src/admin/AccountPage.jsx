import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase, toAppError, unwrapRows } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { PasswordField, passwordProblem } from '../auth/LoginPage.jsx';
import { formatDateTime } from '../lib/format.js';
import { Loading, ErrorState, useConfirm, useToast } from '../ui/Feedback.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import './ops-admin.css';

const ROLE_LABEL = { admin: 'Administrador', editor: 'Editor' };
const nameSchema = z.string().trim().max(120, 'El nombre es demasiado largo (máximo 120 caracteres).');

/** Lanza un Error legible si Auth devuelve error. */
async function authCall(promise) {
  const { data, error } = await promise;
  if (error) {
    const wrapped = new Error(error.code === 'weak_password' ? 'La contraseña es demasiado débil.' : error.message || 'No se pudo completar la operación.');
    wrapped.code = error.code;
    throw wrapped;
  }
  return data;
}

function ProfileSection() {
  const { user, profile, role, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name || '');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: async value => {
      const rows = await unwrapRows(supabase.from('profiles').update({ full_name: value }).eq('id', user.id).select('id'));
      if (!rows?.length) throw new Error('No se pudo guardar tu nombre.');
    },
    onSuccess: async () => { setError(''); await refresh(); toast.success('Nombre actualizado.'); },
    onError: err => { setError(err.message); toast.error(err.message); },
  });
  function submit(e) {
    e.preventDefault();
    const parsed = nameSchema.safeParse(name);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError('');
    save.mutate(parsed.data);
  }
  return (
    <section className="panel" aria-labelledby="acc-profile">
      <div className="panel-head"><h3 id="acc-profile">Mi perfil</h3></div>
      <form className="admin-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <label>Correo electrónico<input value={user?.email || ''} readOnly /></label>
          <label>Rol<input value={ROLE_LABEL[role] || ''} readOnly /></label>
          <label>Nombre completo<input name="full_name" value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="ops-inline"><button type="submit" className="button button-primary" disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar nombre'}</button></div>
      </form>
    </section>
  );
}

function PasswordSection() {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nonce, setNonce] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [error, setError] = useState('');

  const change = useMutation({
    mutationFn: async () => {
      try {
        await authCall(supabase.auth.updateUser(needsCode ? { password, nonce: nonce.trim() } : { password }));
        return 'done';
      } catch (err) {
        if (err.code === 'reauthentication_needed' || err.code === 'reauthentication_not_valid') {
          if (!needsCode) await authCall(supabase.auth.reauthenticate());
          return err.code === 'reauthentication_not_valid' ? 'invalid' : 'code';
        }
        throw err;
      }
    },
    onSuccess: result => {
      if (result === 'done') {
        setPassword(''); setConfirmPassword(''); setNonce(''); setNeedsCode(false); setError('');
        toast.success('Contraseña actualizada.');
      } else if (result === 'code') {
        setNeedsCode(true);
        setError('');
        toast.info('Te enviamos un código por correo. Escríbelo abajo para confirmar el cambio.');
      } else {
        setError('El código no es válido o venció. Revisa tu correo e inténtalo de nuevo.');
      }
    },
    onError: err => { setError(err.message); toast.error(err.message); },
  });

  function submit(e) {
    e.preventDefault();
    const problem = passwordProblem(password, confirmPassword);
    if (problem) { setError(problem); return; }
    if (needsCode && !nonce.trim()) { setError('Escribe el código que recibiste por correo.'); return; }
    setError('');
    change.mutate();
  }

  return (
    <section className="panel" aria-labelledby="acc-password">
      <div className="panel-head"><h3 id="acc-password">Cambiar contraseña</h3></div>
      <form className="admin-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <PasswordField label="Nueva contraseña" name="new-password" autoComplete="new-password" value={password} onChange={setPassword} minLength={10} />
          <PasswordField label="Confirmar nueva contraseña" name="confirm-password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} minLength={10} />
        </div>
        <p className="field-hint">Mínimo 10 caracteres, con mayúsculas, minúsculas y números.</p>
        {needsCode && (
          <label>Código enviado a tu correo
            <input name="nonce" inputMode="numeric" autoComplete="one-time-code" value={nonce} onChange={e => setNonce(e.target.value)} required />
            <span className="field-hint">Por seguridad, confirmamos tu identidad con un código de un solo uso.</span>
          </label>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="ops-inline">
          <button type="submit" className="button button-primary" disabled={change.isPending}>
            {change.isPending ? 'Procesando…' : needsCode ? 'Confirmar cambio de contraseña' : 'Cambiar contraseña'}
          </button>
        </div>
      </form>
    </section>
  );
}

function MfaSection() {
  const { refresh } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const factors = useQuery({
    queryKey: ['admin', 'mfa-factors'],
    queryFn: async () => (await authCall(supabase.auth.mfa.listFactors())).all.filter(f => f.factor_type === 'totp'),
  });
  const reload = async () => { await qc.invalidateQueries({ queryKey: ['admin', 'mfa-factors'] }); await refresh(); };

  const enroll = useMutation({
    mutationFn: () => authCall(supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Panel Bambú ${new Date().toISOString().slice(0, 16).replace('T', ' ')}` })),
    onSuccess: data => { setError(''); setCode(''); setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }); },
    onError: err => { setError(err.message); toast.error(err.message); },
  });
  const verify = useMutation({
    mutationFn: () => authCall(supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: code.replace(/\s/g, '') })),
    onSuccess: async () => { setError(''); setEnrollment(null); setCode(''); await reload(); toast.success('Verificación en dos pasos activada.'); },
    onError: err => { setError(err.message); toast.error(err.message); },
  });
  const unenroll = useMutation({
    mutationFn: id => authCall(supabase.auth.mfa.unenroll({ factorId: id })),
    onSuccess: async () => { setError(''); await reload(); toast.success('Método de verificación eliminado.'); },
    onError: err => { setError(err.message); toast.error(err.message); },
  });

  async function cancelEnrollment() {
    const id = enrollment.id;
    setEnrollment(null); setCode(''); setError('');
    try { await authCall(supabase.auth.mfa.unenroll({ factorId: id })); await reload(); } catch { /* el factor sin verificar caduca solo */ }
  }
  async function remove(factor) {
    const ok = await confirm({
      title: factor.status === 'verified' ? '¿Quitar la verificación en dos pasos?' : '¿Eliminar este intento de configuración?',
      message: factor.status === 'verified' ? 'Tu cuenta quedará protegida solo con la contraseña.' : undefined,
      confirmLabel: 'Sí, eliminar', cancelLabel: 'Volver', danger: true,
    });
    if (ok) unenroll.mutate(factor.id);
  }

  const busy = enroll.isPending || verify.isPending || unenroll.isPending;
  return (
    <section className="panel" aria-labelledby="acc-mfa">
      <div className="panel-head"><h3 id="acc-mfa">Verificación en dos pasos (app autenticadora)</h3></div>
      <div className="ops-stack">
        {factors.isLoading ? <Loading /> : factors.error ? <ErrorState error={toAppError(factors.error)} onRetry={factors.refetch} /> : (
          factors.data.length === 0 ? <p className="ops-muted">No tienes verificación en dos pasos activada.</p> : (
            <ul className="ops-list">
              {factors.data.map(f => (
                <li key={f.id}>
                  <span><strong>{f.friendly_name || 'Aplicación autenticadora'}</strong><br /><small>Creada {formatDateTime(f.created_at)}</small></span>
                  <span className="ops-inline">
                    <StatusPill tone={f.status === 'verified' ? '' : 'gold'}>{f.status === 'verified' ? 'Activa' : 'Sin verificar'}</StatusPill>
                    <button type="button" className="button button-danger" disabled={busy} onClick={() => remove(f)}>Eliminar</button>
                  </span>
                </li>
              ))}
            </ul>
          )
        )}
        {enrollment ? (
          <form className="admin-form" onSubmit={e => { e.preventDefault(); if (!code.trim()) { setError('Escribe el código de 6 dígitos.'); return; } verify.mutate(); }} noValidate>
            <p>Escanea este código con tu aplicación autenticadora (Google Authenticator, Authy, 1Password…) y escribe el código de 6 dígitos.</p>
            <img className="ops-qr" src={enrollment.qr} alt="Código QR para configurar la aplicación autenticadora" />
            <p className="field-hint">¿No puedes escanear? Ingresa esta clave manualmente: <span className="ops-secret">{enrollment.secret}</span></p>
            <label>Código de verificación
              <input name="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e => setCode(e.target.value)} required />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="ops-inline">
              <button type="submit" className="button button-primary" disabled={busy}>{verify.isPending ? 'Verificando…' : 'Verificar y activar'}</button>
              <button type="button" className="button button-ghost" disabled={busy} onClick={cancelEnrollment}>Cancelar</button>
            </div>
          </form>
        ) : (
          <>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="ops-inline"><button type="button" className="button button-primary" disabled={busy} onClick={() => enroll.mutate()}>{enroll.isPending ? 'Preparando…' : 'Configurar app autenticadora'}</button></div>
          </>
        )}
      </div>
    </section>
  );
}

function SessionsSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const out = useMutation({
    mutationFn: () => authCall(supabase.auth.signOut({ scope: 'others' })),
    onSuccess: () => toast.success('Se cerraron las demás sesiones.'),
    onError: err => toast.error(err.message),
  });
  async function run() {
    const ok = await confirm({ title: '¿Cerrar las demás sesiones?', message: 'Tendrás que volver a iniciar sesión en tus otros dispositivos. Esta sesión se mantiene.', confirmLabel: 'Sí, cerrarlas', cancelLabel: 'Volver', danger: true });
    if (ok) out.mutate();
  }
  return (
    <section className="panel" aria-labelledby="acc-sessions">
      <div className="panel-head"><h3 id="acc-sessions">Sesiones</h3></div>
      <p className="ops-muted">Si usaste un equipo compartido o sospechas de un acceso no autorizado, cierra las sesiones en otros dispositivos.</p>
      <div className="ops-inline" style={{ marginTop: 12 }}><button type="button" className="button button-ghost" disabled={out.isPending} onClick={run}>{out.isPending ? 'Cerrando…' : 'Cerrar las demás sesiones'}</button></div>
    </section>
  );
}

export default function AccountPage() {
  return (
    <AdminPage title="Mi cuenta" description="Tu perfil, contraseña y seguridad de acceso.">
      <div className="ops-stack">
        <ProfileSection />
        <PasswordSection />
        <MfaSection />
        <SessionsSection />
      </div>
    </AdminPage>
  );
}
