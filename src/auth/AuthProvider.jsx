import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

/**
 * status: 'loading' | 'signedOut' | 'needsMfa' | 'noAccess' | 'staff'
 * El rol se obtiene del servidor (current_staff_role, que valida perfil activo y AAL2 si hay MFA).
 * La interfaz solo oculta pantallas; los permisos reales los impone RLS en PostgreSQL.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ status: 'loading', role: null, profile: null });
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) { setSession(null); return undefined; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (session === undefined) return;
    if (!session) { setState({ status: 'signedOut', role: null, profile: null }); return; }
    const [{ data: aal }, roleRes, profileRes] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.rpc('current_staff_role'),
      supabase.from('profiles').select('id,email,full_name,role,active').eq('id', session.user.id).maybeSingle(),
    ]);
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
      setState({ status: 'needsMfa', role: null, profile: null });
      return;
    }
    const role = roleRes.data || null;
    setState({ status: role ? 'staff' : 'noAccess', role, profile: profileRes.data || null });
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ status: 'signedOut', role: null, profile: null });
  }, []);

  const value = useMemo(() => ({
    session, user: session?.user || null, ...state, recovery,
    isAdmin: state.role === 'admin', refresh, signOut,
  }), [session, state, recovery, refresh, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export function FullPageStatus({ children }) {
  return <div className="auth-shell"><div className="auth-card" role="status" aria-live="polite">{children}</div></div>;
}

/** Bloquea por defecto: solo personal autorizado ve el contenido. */
export function RequireStaff({ children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <FullPageStatus><p>Verificando sesión…</p></FullPageStatus>;
  if (auth.status === 'signedOut' || auth.status === 'needsMfa') {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (auth.status === 'noAccess') {
    return (
      <FullPageStatus>
        <h1>Sin acceso al panel</h1>
        <p>Tu cuenta no tiene un rol administrativo activo. Pide a un administrador que te habilite.</p>
        <button className="button button-primary" type="button" onClick={auth.signOut}>Cerrar sesión</button>
      </FullPageStatus>
    );
  }
  return children;
}

export function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <div className="panel" role="alert">
        <h2>Solo administradores</h2>
        <p>Tu rol de editor no incluye esta sección. Si necesitas acceso, pídelo a un administrador.</p>
      </div>
    );
  }
  return children;
}
