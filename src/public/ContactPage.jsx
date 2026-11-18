import { usePublicSettings } from '../api/public.js';
import { normalizeWhatsApp } from '../lib/whatsapp.js';
import { ErrorState, Loading } from '../ui/Feedback.jsx';
import { useBooking } from './BookingContext.jsx';
import { safeUrl, usePageTitle } from './shared.js';

const PENDING = 'Por confirmar';

function Row({ label, children }) {
  return <div className="contact-row"><span>{label}</span><b>{children || <span className="pending">{PENDING}</span>}</b></div>;
}

export default function ContactPage() {
  usePageTitle('Ubicación y contacto');
  const booking = useBooking();
  const { data: s, isLoading, error, refetch } = usePublicSettings();

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const address = s?.address?.trim();
  const city = s?.city?.trim();
  const whatsapp = normalizeWhatsApp(s?.whatsapp);
  const social = Object.entries(s?.social || {}).filter(([, v]) => String(v || '').trim());
  const mapQuery = [address, city].filter(Boolean).join(', ') || 'Mocoa, Putumayo';
  const mapUrl = safeUrl(s?.map_url) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`;

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">Ubicación y contacto</span>
        <h1>Estamos en Mocoa.</h1>
        <p>Consulta tu estadía y confirma los detalles de llegada directamente con el hotel.</p>
      </section>
      <section className="contact-grid">
        <article className="contact-card">
          <span className="eyebrow">Hablemos</span>
          <h2>Tu estadía empieza con una conversación.</h2>
          <div className="contact-list">
            <Row label="Dirección">{address}</Row>
            <Row label="Teléfono">{s?.phone && <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`}>{s.phone}</a>}</Row>
            <Row label="WhatsApp">{whatsapp && <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer">+{whatsapp}</a>}</Row>
            <Row label="Correo">{s?.email && <a href={`mailto:${s.email}`}>{s.email}</a>}</Row>
            <Row label="Horario">{s?.business_hours}</Row>
            {social.length > 0 && (
              <Row label="Redes">
                {social.map(([name, value], i) => {
                  const url = safeUrl(value);
                  return (
                    <span key={name}>
                      {i > 0 && ' · '}
                      {url ? <a href={url} target="_blank" rel="noopener noreferrer">{name}</a> : `${name}: ${value}`}
                    </span>
                  );
                })}
              </Row>
            )}
          </div>
          <button className="button button-primary" type="button" onClick={() => booking.open()}>Preparar consulta</button>
        </article>
        <article className="map-card">
          <div className="map-placeholder">
            <span className="eyebrow" style={{ color: 'white' }}>Ubicación</span>
            <h3 style={{ fontSize: '2rem', marginBottom: 8 }}>{city || 'Mocoa, Putumayo'}</h3>
            <p>{address || 'La dirección exacta se publicará cuando el hotel la confirme.'}</p>
            <a className="button button-light" href={mapUrl} target="_blank" rel="noopener noreferrer">Abrir en Google Maps ↗</a>
          </div>
        </article>
      </section>
    </>
  );
}
