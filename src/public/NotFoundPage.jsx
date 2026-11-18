import { Link } from 'react-router-dom';
import { usePageTitle } from './shared.js';

function PublicNotFound({ title = 'Página no encontrada', message = 'La dirección que buscas no existe o fue movida.' }) {
  usePageTitle(title);
  return (
    <section className="page-hero not-found">
      <span className="eyebrow">Error 404</span>
      <h1>{title}</h1>
      <p>{message}</p>
      <div className="not-found-actions">
        <Link className="button button-primary" to="/">Volver al inicio</Link>
        <Link className="button button-ghost" to="/habitaciones">Ver habitaciones</Link>
      </div>
    </section>
  );
}

export function NotFoundContent(props) { return <PublicNotFound {...props} />; }

export default function NotFoundPage({ admin = false }) {
  if (admin) {
    return (
      <div className="empty-state">
        <strong>Página no encontrada</strong>
        <div><Link to="/admin">Volver al panel</Link></div>
      </div>
    );
  }
  return <PublicNotFound />;
}
