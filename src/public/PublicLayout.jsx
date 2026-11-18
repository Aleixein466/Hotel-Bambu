import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLiveRevisions, usePublicSettings, useSiteContent } from '../api/public.js';
import { buildWhatsAppLink } from '../lib/whatsapp.js';
import { BrandMark } from '../ui/Brand.jsx';
import { BookingProvider, useBooking } from './BookingContext.jsx';
import './public.css';

const NAV = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/habitaciones', label: 'Habitaciones' },
  { to: '/galeria', label: 'Galería' },
  { to: '/novedades', label: 'Novedades' },
  { to: '/informacion', label: 'Información' },
  { to: '/contacto', label: 'Ubicación y contacto' },
];

function Header({ menuOpen, setMenuOpen }) {
  const booking = useBooking();
  return (
    <>
      <header className="site-header" id="site-header">
        <Link className="brand" to="/" aria-label="Hotel Bambú Plaza, ir al inicio" onClick={() => setMenuOpen(false)}>
          <BrandMark label="Símbolo de bambú estilizado" />
          <span className="brand-copy"><strong>Hotel Bambú</strong><small>PLAZA · MOCOA</small></span>
        </Link>
        <nav className="desktop-nav" aria-label="Navegación principal">
          {NAV.map(item => <NavLink key={item.to} to={item.to} end={item.end}>{item.label}</NavLink>)}
        </nav>
        <div className="header-actions">
          <button className="icon-button menu-button" type="button" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <button className="button button-dark header-cta" type="button" onClick={() => booking.open()}>Consultar estadía</button>
        </div>
      </header>
      {menuOpen && (
        <nav className="mobile-menu" id="mobile-menu" aria-label="Navegación móvil">
          {NAV.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)}>{item.label}</NavLink>)}
        </nav>
      )}
    </>
  );
}

function Footer({ settings, content }) {
  const footer = content?.footer || {};
  const name = settings?.hotel_name || 'Hotel Bambú Plaza';
  const times = [settings?.check_in_time && `Entrada: ${settings.check_in_time}`, settings?.check_out_time && `Salida: ${settings.check_out_time}`].filter(Boolean);
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <Link className="brand" to="/">
            <BrandMark stroke="#26312B" />
            <span className="brand-copy"><strong>Hotel Bambú</strong><small>PLAZA · MOCOA</small></span>
          </Link>
          {footer.tagline && <p style={{ maxWidth: 320, marginTop: 20 }}>{footer.tagline}</p>}
        </div>
        <div>
          <h4>Explorar</h4>
          <ul>
            <li><Link to="/habitaciones">Habitaciones</Link></li>
            <li><Link to="/galeria">Galería</Link></li>
            <li><Link to="/novedades">Novedades</Link></li>
          </ul>
        </div>
        <div>
          <h4>Información</h4>
          <ul>
            <li><Link to="/informacion">Preguntas y políticas</Link></li>
            {times.map(t => <li key={t}>{t}</li>)}
          </ul>
        </div>
        <div>
          <h4>Contacto</h4>
          <ul>
            <li>{settings?.address || settings?.city || 'Mocoa, Putumayo'}</li>
            {settings?.phone && <li>Tel. {settings.phone}</li>}
            {settings?.email && <li>{settings.email}</li>}
            <li><Link to="/contacto">Ubicación y contacto</Link></li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} {name}</span>{footer.note && <span>{footer.note}</span>}</div>
    </footer>
  );
}

function WhatsAppButton({ settings }) {
  const booking = useBooking();
  const link = buildWhatsAppLink(settings?.whatsapp, {});
  if (link) {
    return (
      <a className="whatsapp-fab" href={link} target="_blank" rel="noopener noreferrer" aria-label="Escribir al hotel por WhatsApp">
        <span aria-hidden="true">◖</span><span>WhatsApp</span><small>Escríbenos</small>
      </a>
    );
  }
  return (
    <button className="whatsapp-fab" type="button" aria-label="Consultar estadía" onClick={() => booking.open()}>
      <span aria-hidden="true">◖</span><span>Consultar</span><small>Solicitar estadía</small>
    </button>
  );
}

function Shell() {
  useLiveRevisions();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const settings = usePublicSettings().data;
  const content = useSiteContent().data;

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      <main id="contenido" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer settings={settings} content={content} />
      <WhatsAppButton settings={settings} />
    </>
  );
}

export default function PublicLayout() {
  return (
    <BookingProvider>
      <Shell />
    </BookingProvider>
  );
}
