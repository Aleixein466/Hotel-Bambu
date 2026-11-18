import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePublicRoom } from '../api/public.js';
import { formatPrice } from '../lib/format.js';
import { mediaUrl } from '../lib/media.js';
import { ErrorState, Loading } from '../ui/Feedback.jsx';
import { useBooking } from './BookingContext.jsx';
import Lightbox from './Lightbox.jsx';
import { NotFoundContent } from './NotFoundPage.jsx';
import { ConceptBadge, Photo } from './parts.jsx';
import { usePageTitle } from './shared.js';

export default function RoomDetailPage() {
  const { number } = useParams();
  const { data: room, isLoading, error, refetch } = usePublicRoom(number);
  const booking = useBooking();
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  usePageTitle(room ? `${room.name} · ${room.room_type}` : 'Habitación');

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!room) return <NotFoundContent title="Habitación no encontrada" message="Esta habitación no existe o no está publicada." />;

  const images = room.images?.length ? room.images : (room.cover ? [room.cover] : []);
  const current = images[Math.min(active, images.length - 1)];
  const maintenance = room.operational_status === 'maintenance';
  const lightboxItems = images.map(m => ({ src: mediaUrl(m), alt: m.alt_text || `Fotografía de ${room.name}`, caption: m.alt_text || room.name }));

  return (
    <section className="room-detail">
      <div className="detail-media">
        {current ? (
          <button type="button" className="detail-main" aria-label="Ampliar imagen" onClick={() => setLightbox(Math.min(active, images.length - 1))}>
            <Photo media={current} alt={current.alt_text || `Fotografía de ${room.name}`} loading="eager" />
          </button>
        ) : <div className="detail-empty">Fotografías por publicar</div>}
        <ConceptBadge media={current} />
        {images.length > 1 && (
          <div className="detail-thumbs" role="group" aria-label="Fotografías de la habitación">
            {images.map((m, i) => (
              <button key={m.id} type="button" className={i === active ? 'active' : ''} aria-label={`Ver fotografía ${i + 1} de ${images.length}`} aria-pressed={i === active} onClick={() => setActive(i)}>
                <Photo media={m} thumb alt="" />
              </button>
            ))}
          </div>
        )}
      </div>
      <article className="detail-content">
        <Link to="/habitaciones" className="eyebrow">← Todas las habitaciones</Link>
        <small className="room-number">{room.name}</small>
        <h1>{room.room_type}</h1>
        {room.description && <p className="lead">{room.description}</p>}
        {maintenance && <p className="status-note">En mantenimiento: por ahora no recibe solicitudes.</p>}
        {!room.details_confirmed && <p className="fine-print">Datos por confirmar con el hotel</p>}
        <div className="detail-block"><h3>Capacidad</h3><p>Hasta {room.capacity} {room.capacity === 1 ? 'huésped' : 'huéspedes'}</p></div>
        {room.amenities?.length > 0 && (
          <div className="detail-block"><h3>Servicios</h3><ul className="feature-list">{room.amenities.map(a => <li key={a}>{a}</li>)}</ul></div>
        )}
        <div className="detail-block">
          <h3>Tarifa</h3>
          {room.price_cop != null
            ? <p className="price-pending"><strong>{formatPrice(room.price_cop)} por noche</strong><br />La tarifa final la confirma el hotel al responder tu solicitud.</p>
            : <p className="price-pending"><strong>Tarifa por confirmar</strong><br />El hotel te informará el valor al responder tu solicitud.</p>}
        </div>
        <div className="detail-block"><h3>Disponibilidad</h3><p>Al consultar verás las fechas ocupadas de esta habitación. El hotel confirma cada solicitud; enviarla no garantiza la reserva.</p></div>
        <button className="button button-primary" type="button" disabled={maintenance} onClick={() => booking.open({ roomId: room.id })}>
          {maintenance ? 'En mantenimiento' : 'Consultar esta habitación'}
        </button>
      </article>
      {lightbox != null && <Lightbox items={lightboxItems} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </section>
  );
}
