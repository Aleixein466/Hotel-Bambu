import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePublicRooms } from '../api/public.js';
import { formatPrice } from '../lib/format.js';
import { EmptyState, ErrorState, Loading } from '../ui/Feedback.jsx';
import { useBooking } from './BookingContext.jsx';
import { ConceptBadge, Photo } from './parts.jsx';
import { usePageTitle } from './shared.js';

function RoomCard({ room }) {
  const booking = useBooking();
  const maintenance = room.operational_status === 'maintenance';
  return (
    <article className="room-card" data-type={room.room_type}>
      <div className="room-card-image">
        {room.cover && <Photo media={room.cover} thumb alt={room.cover.alt_text || `Fotografía de ${room.name}`} />}
        <ConceptBadge media={room.cover} />
        {maintenance && <span className="status-pill">En mantenimiento</span>}
      </div>
      <div className="room-card-copy">
        <small className="room-number">{room.name}</small>
        <h3>{room.room_type}</h3>
        {room.description && <p>{room.description}</p>}
        <div className="room-card-meta">
          <span>Hasta {room.capacity} {room.capacity === 1 ? 'huésped' : 'huéspedes'}</span>
          {room.amenities.map(a => <span key={a}>{a}</span>)}
        </div>
        <p className="room-price">{room.price_cop != null ? `Desde ${formatPrice(room.price_cop)} por noche` : 'Tarifa por confirmar'}</p>
        {!room.details_confirmed && <p className="fine-print">Datos por confirmar con el hotel</p>}
        <div className="room-card-actions">
          <Link className="button button-ghost" to={`/habitaciones/${room.number}`}>Ver habitación</Link>
          <button className="button button-primary" type="button" disabled={maintenance} onClick={() => booking.open({ roomId: room.id })}>
            {maintenance ? 'No disponible para consulta' : 'Consultar'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function RoomsPage() {
  usePageTitle('Habitaciones');
  const { data: rooms, isLoading, error, refetch } = usePublicRooms();
  const [filter, setFilter] = useState('Todas');

  const types = [...new Set((rooms || []).map(r => r.room_type))];
  const shown = (rooms || []).filter(r => filter === 'Todas' || r.room_type === filter);
  const count = `${shown.length} ${shown.length === 1 ? 'habitación' : 'habitaciones'}`;

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">{rooms ? `${rooms.length} ${rooms.length === 1 ? 'habitación' : 'habitaciones'}` : 'Habitaciones'}</span>
        <h1>Encuentra tu espacio.</h1>
        <p>Cada habitación tiene su propia capacidad, tarifa y galería. Elige una y consulta la disponibilidad para tus fechas.</p>
      </section>
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {rooms && (
        <>
          <div className="toolbar">
            <div className="filter-chips" role="group" aria-label="Filtrar habitaciones">
              {['Todas', ...types].map(type => (
                <button key={type} type="button" className={`chip${filter === type ? ' active' : ''}`} aria-pressed={filter === type} onClick={() => setFilter(type)}>{type}</button>
              ))}
            </div>
            <span id="room-count">{count}</span>
          </div>
          {shown.length === 0
            ? <EmptyState title="Aún no hay habitaciones publicadas.">Vuelve pronto o escríbenos para consultar.</EmptyState>
            : <section className="room-grid" id="room-grid">{shown.map(room => <RoomCard key={room.id} room={room} />)}</section>}
        </>
      )}
    </>
  );
}
