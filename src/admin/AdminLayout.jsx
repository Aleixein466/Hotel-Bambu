import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { BrandMark } from '../ui/Brand.jsx';
import './admin.css';

const NAV = [
  { to: '/admin', label: 'Resumen', icon: '⌂', end: true },
  { to: '/admin/solicitudes', label: 'Solicitudes', icon: '✉', admin: true },
  { to: '/admin/reservas', label: 'Reservas y bloqueos', icon: '▤', admin: true },
  { to: '/admin/calendario', label: 'Calendario', icon: '□', admin: true },
  { to: '/admin/habitaciones', label: 'Habitaciones', icon: '▦' },
  { to: '/admin/contenido', label: 'Contenido del sitio', icon: '✎' },
  { to: '/admin/publicaciones', label: 'Publicaciones', icon: '❖' },
  { to: '/admin/galeria', label: 'Galería', icon: '◫' },
  { to: '/admin/medios', label: 'Fotografías', icon: '▣' },
  { to: '/admin/configuracion', label: 'Configuración', icon: '⚙', admin: true },
  { to: '/admin/usuarios', label: 'Usuarios', icon: '☺', admin: true },
  { to: '/admin/actividad', label: 'Actividad', icon: '≡', admin: true },
];

export default function AdminLayout() {
  const { profile, role, isAdmin, signOut, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <div className="admin-layout">
      <a className="skip-link" href="#admin-main">Saltar al contenido</a>
      <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`} aria-label="Menú del panel">
        <div className="admin-sidebar-head">
          <NavLink className="brand" to="/admin"><BrandMark stroke="#000" /><span className="brand-copy"><strong>Bambú Admin</strong><small>HOTEL BAMBÚ PLAZA</small></span></NavLink>
          <button type="button" className="icon-button admin-menu-toggle" aria-expanded={menuOpen} aria-controls="admin-nav" onClick={() => setMenuOpen(v => !v)} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}>☰</button>
        </div>
        <nav className="admin-nav" id="admin-nav">
          {NAV.filter(item => !item.admin || isAdmin).map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-user">
          <strong>{profile?.full_name || user?.email}</strong>
          <small>{user?.email} · {role === 'admin' ? 'Administrador' : 'Editor'}</small>
          <div className="admin-user-actions">
            <NavLink to="/admin/cuenta">Mi cuenta</NavLink>
            <a href="/" target="_blank" rel="noopener">Ver sitio ↗</a>
            <button type="button" className="link-button" onClick={signOut}>Cerrar sesión</button>
          </div>
        </div>
      </aside>
      <main className="admin-main" id="admin-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

/** Encabezado estándar de cada página del panel. */
export function AdminPage({ title, description, actions, children }) {
  useEffect(() => { document.title = `${title} · Panel Bambú`; }, [title]);
  return (
    <div className="admin-content">
      <header className="admin-heading">
        <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
        {actions && <div className="admin-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function StatusPill({ tone = 'gray', children }) {
  return <span className={`state ${tone}`}>{children}</span>;
}
