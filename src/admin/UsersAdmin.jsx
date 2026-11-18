import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase, unwrap, unwrapRows } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { formatDateTime } from '../lib/format.js';
import { Loading, ErrorState, EmptyState, useConfirm, useToast } from '../ui/Feedback.jsx';
import { AdminPage, StatusPill } from './AdminLayout.jsx';
import { useInvalidateAdmin } from './opsApi.js';
import './ops-admin.css';

const ROLE_LABEL = { admin: 'Administrador', editor: 'Editor' };
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Escribe un correo válido.'),
  full_name: z.string().trim().min(2, 'Escribe el nombre (mínimo 2 letras).').max(120, 'El nombre es demasiado largo.'),
  role: z.enum(['admin', 'editor']),
});

function InviteForm() {
  const toast = useToast();
  const invalidate = useInvalidateAdmin();
  const [form, setForm] = useState({ email: '', full_name: '', role: 'editor' });
  const [errors, setErrors] = useState({});
  const [inviteError, setInviteError] = useState(false);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const invite = useMutation({
    mutationFn: async values => {
      const { data, error } = await supabase.functions.invoke('invite-user', { body: values });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (_, values) => {
      setInviteError(false);
      setForm({ email: '', full_name: '', role: 'editor' });
      await invalidate();
      toast.success(`Invitación enviada a ${values.email}.`);
    },
    onError: () => setInviteError(true),
  });

  function submit(e) {
    e.preventDefault();
    setInviteError(false);
    const parsed = inviteSchema.safeParse(form);
    if (!parsed.success) {
      const next = {};
      for (const issue of parsed.error.issues) next[issue.path[0]] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    invite.mutate(parsed.data);
  }

  return (
    <section className="panel ops-form-card" aria-labelledby="invite-title">
      <div className="panel-head"><h3 id="invite-title">Invitar usuario</h3></div>
      <form className="admin-form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <label>Correo electrónico
            <input name="email" type="email" autoComplete="off" value={form.email} onChange={set('email')} required aria-invalid={Boolean(errors.email)} />
            {errors.email && <span className="form-error" role="alert">{errors.email}</span>}
          </label>
          <label>Nombre completo
            <input name="full_name" value={form.full_name} onChange={set('full_name')} maxLength={120} required aria-invalid={Boolean(errors.full_name)} />
            {errors.full_name && <span className="form-error" role="alert">{errors.full_name}</span>}
          </label>
          <label>Rol
            <select name="role" value={form.role} onChange={set('role')}>
              <option value="editor">Editor (contenido)</option>
              <option value="admin">Administrador (todo)</option>
            </select>
          </label>
        </div>
        {inviteError && (
          <div className="ops-callout" role="alert">
            <span>No se pudo invitar. Verifica que la función invite-user esté desplegada (ver README).</span>
            <span>Alternativa por terminal: <code>npm run create-admin -- --email {form.email || 'correo@ejemplo.com'} --role {form.role} --invite</code></span>
          </div>
        )}
        <div className="ops-inline"><button type="submit" className="button button-primary" disabled={invite.isPending}>{invite.isPending ? 'Enviando…' : 'Enviar invitación'}</button></div>
      </form>
    </section>
  );
}

export default function UsersAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const invalidate = useInvalidateAdmin();
  const [rowError, setRowError] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => unwrap(supabase.from('profiles').select('id,email,full_name,role,active,created_at').order('created_at')),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }) => unwrapRows(supabase.from('profiles').update(patch).eq('id', id).select('id')).then(rows => {
      if (!rows?.length) throw new Error('No se pudo actualizar el usuario.');
    }),
    onSuccess: async (_, { message }) => { setRowError(''); await invalidate(); toast.success(message); },
    onError: err => { setRowError(err.message); toast.error(err.message); },
  });

  async function changeRole(profile, role) {
    if (role === profile.role) return;
    const ok = await confirm({ title: '¿Cambiar el rol?', message: `${profile.email} pasará a ser ${ROLE_LABEL[role].toLowerCase()}.`, confirmLabel: 'Sí, cambiar rol', cancelLabel: 'Volver' });
    if (ok) update.mutate({ id: profile.id, patch: { role }, message: 'Rol actualizado.' });
  }
  async function toggleActive(profile) {
    const activate = !profile.active;
    const ok = await confirm({
      title: activate ? '¿Activar el usuario?' : '¿Desactivar el usuario?',
      message: activate ? `${profile.email} podrá entrar de nuevo al panel.` : `${profile.email} ya no podrá entrar al panel.`,
      confirmLabel: activate ? 'Sí, activar' : 'Sí, desactivar', cancelLabel: 'Volver', danger: !activate,
    });
    if (ok) update.mutate({ id: profile.id, patch: { active: activate }, message: activate ? 'Usuario activado.' : 'Usuario desactivado.' });
  }

  return (
    <AdminPage title="Usuarios" description="Personal con acceso al panel. No hay registro público: las cuentas las crea un administrador.">
      <InviteForm />
      {rowError && <p className="form-error" role="alert">{rowError}</p>}
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : data.length === 0 ? <EmptyState title="No hay usuarios" /> : (
        <div className="panel table-scroll">
          <table className="data-table ops-table">
            <thead><tr><th>Correo</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Alta</th><th>Acciones</th></tr></thead>
            <tbody>
              {data.map(p => (
                <tr key={p.id} data-user-email={p.email}>
                  <td>{p.email}{p.id === user?.id && <> <small className="ops-muted">(tú)</small></>}</td>
                  <td>{p.full_name || '—'}</td>
                  <td>
                    <select aria-label={`Rol de ${p.email}`} value={p.role} disabled={update.isPending} onChange={e => changeRole(p, e.target.value)} style={{ minWidth: 150 }}>
                      <option value="admin">Administrador</option>
                      <option value="editor">Editor</option>
                    </select>
                  </td>
                  <td><StatusPill tone={p.active ? '' : 'gray'}>{p.active ? 'Activo' : 'Inactivo'}</StatusPill></td>
                  <td>{formatDateTime(p.created_at)}</td>
                  <td><button type="button" className={`button ${p.active ? 'button-danger' : 'button-ghost'}`} disabled={update.isPending} onClick={() => toggleActive(p)}>{p.active ? 'Desactivar' : 'Activar'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  );
}
