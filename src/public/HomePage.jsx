import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePublicGallery, usePublicPosts, usePublicRooms, usePublicSettings, useSiteContent } from '../api/public.js';
import { hotelToday, addDays, validateStay, POST_KIND } from '../lib/format.js';
import { mediaUrl } from '../lib/media.js';
import { ErrorState, Loading } from '../ui/Feedback.jsx';
import { useBooking } from './BookingContext.jsx';
import Lightbox from './Lightbox.jsx';
import { ConceptBadge, Paragraphs, Photo } from './parts.jsx';
import { formatTsDate, usePageTitle, usePublicMedia } from './shared.js';

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = n => String(n).padStart(2, '0');

function Hero({ hero, slides, eyebrow }) {
  const booking = useBooking();
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => hero?.autoplay !== false && !prefersReducedMotion());
  const [touchStart, setTouchStart] = useState(0);

  useEffect(() => {
    if (!playing || count < 2) return undefined;
    const timer = setTimeout(() => setIndex(i => (i + 1) % count), 6500);
    return () => clearTimeout(timer);
  }, [playing, index, count]);

  const go = next => { setIndex((next + count) % count); setPlaying(false); };

  return (
    <section
      className="hero"
      aria-labelledby="hero-title"
      onTouchStart={e => setTouchStart(e.changedTouches[0].clientX)}
      onTouchEnd={e => {
        const dx = e.changedTouches[0].clientX - touchStart;
        if (count > 1 && Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="hero-slides" aria-hidden="true">
        {slides.map((media, i) => (
          <div key={media.id} className={`hero-slide${i === index ? ' active' : ''}`}>
            <img src={mediaUrl(media)} alt="" {...(i === 0 ? { fetchPriority: 'high' } : { loading: 'lazy' })} />
          </div>
        ))}
      </div>
      <div className="hero-content">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1 id="hero-title">{hero?.headline}</h1>
        {hero?.intro && <p className="hero-copy">{hero.intro}</p>}
        <div className="hero-actions">
          <Link className="button button-light" to="/habitaciones">Ver habitaciones <span aria-hidden="true">↗</span></Link>
          <button className="button button-outline-light" type="button" onClick={() => booking.open()}>Consultar estadía</button>
        </div>
        {slides[index]?.is_concept && <span className="hero-concept"><ConceptBadge media={slides[index]} /></span>}
      </div>
      {count > 1 && (
        <>
          <div className="carousel-controls">
            <button className="icon-button" type="button" aria-label="Fotografía anterior" onClick={() => go(index - 1)}>←</button>
            <button className="icon-button" type="button" aria-label={playing ? 'Pausar carrusel' : 'Reproducir carrusel'} onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ' : '▶'}</button>
            <button className="icon-button" type="button" aria-label="Fotografía siguiente" onClick={() => go(index + 1)}>→</button>
          </div>
          <div className="carousel-index"><strong>{pad(index + 1)}</strong> <span>/ {pad(count)}</span></div>
        </>
      )}
    </section>
  );
}

function QuickSearch() {
  const booking = useBooking();
  const today = hotelToday();
  const [form, setForm] = useState({ checkin: '', checkout: '', guests: '1' });
  const [error, setError] = useState('');
  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError(''); };

  const onSubmit = e => {
    e.preventDefault();
    const stay = validateStay(form.checkin, form.checkout, today);
    if (stay.error) { setError(stay.error); return; }
    booking.open({ checkIn: form.checkin, checkOut: form.checkout, guests: Number(form.guests) });
  };

  return (
    <>
      <form className="search-bar" id="quick-search" onSubmit={onSubmit} noValidate>
        <div className="search-intro"><span>PLANEA TU ESTADÍA</span><strong>¿Cuándo vienes?</strong></div>
        <label>Entrada<input type="date" name="checkin" min={today} value={form.checkin} onChange={e => set('checkin', e.target.value)} required /></label>
        <label>Salida<input type="date" name="checkout" min={form.checkin ? addDays(form.checkin, 1) : addDays(today, 1)} value={form.checkout} onChange={e => set('checkout', e.target.value)} required /></label>
        <label>Huéspedes
          <select name="guests" value={form.guests} onChange={e => set('guests', e.target.value)}>
            {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} {n === 1 ? 'huésped' : 'huéspedes'}</option>)}
          </select>
        </label>
        <button className="button button-primary" type="submit">Preparar consulta ↗</button>
      </form>
      <div className="search-disclaimer">
        {error ? <span className="form-error" role="alert">{error}</span> : 'Las fechas preparan una solicitud. El hotel confirma disponibilidad y tarifa personalmente.'}
      </div>
    </>
  );
}

/** Una foto por categoría (para variar) y, si faltan, las siguientes. */
function pickPreview(items, size = 3) {
  const picked = [];
  const seen = new Set();
  items.forEach(item => { if (!seen.has(item.category) && picked.length < size) { seen.add(item.category); picked.push(item); } });
  items.forEach(item => { if (picked.length < size && !picked.includes(item)) picked.push(item); });
  return picked;
}

export default function HomePage() {
  usePageTitle('');
  const booking = useBooking();
  const contentQ = useSiteContent();
  const roomsQ = usePublicRooms();
  const galleryQ = usePublicGallery();
  const postsQ = usePublicPosts();
  const settings = usePublicSettings().data;
  const content = contentQ.data;
  const hero = content?.['home.hero'];
  const welcome = content?.['home.welcome'];
  const services = content?.['home.services'];
  const about = content?.about;
  const slideIds = Array.isArray(hero?.slides) ? hero.slides : [];
  const media = usePublicMedia([...slideIds, welcome?.media_id]);
  const [lightbox, setLightbox] = useState(null);

  if (contentQ.isLoading) return <Loading />;
  if (contentQ.error) return <ErrorState error={contentQ.error} onRetry={() => contentQ.refetch()} />;

  const slides = slideIds.map(id => media.byId[id]).filter(Boolean);
  const welcomeMedia = media.byId[welcome?.media_id];
  const rooms = roomsQ.data || [];
  const gallery = galleryQ.data || [];
  const preview = pickPreview(gallery);
  const latestPosts = (postsQ.data || []).slice(0, 3);
  const items = Array.isArray(services?.items) ? services.items : [];
  const facade = gallery.find(g => g.category === 'Fachada') || gallery[gallery.length - 1];
  const showcaseRoom = rooms.find(r => r.cover);
  const showcaseGallery = gallery.find(g => g.media && g.media.id !== showcaseRoom?.cover?.id);
  const lightboxItems = preview.map(g => ({ src: mediaUrl(g.media), alt: g.media.alt_text, caption: g.caption || g.media.alt_text }));

  return (
    <>
      <Hero key={slides.map(s => s.id).join()} hero={hero} slides={slides} eyebrow={hero?.eyebrow} />
      <QuickSearch />

      {(welcome?.title || welcome?.body) && (
        <section className="section welcome-section">
          {welcomeMedia && (
            <div className="welcome-media">
              <Photo media={welcomeMedia} />
              <ConceptBadge media={welcomeMedia} />
            </div>
          )}
          <div className="welcome-copy">
            {welcome.eyebrow && <span className="eyebrow">{welcome.eyebrow}</span>}
            {welcome.title && <h2>{welcome.title}</h2>}
            <Paragraphs text={welcome.body} />
            <Link className="text-link" to="/galeria">Conocer el hotel <span aria-hidden="true">↗</span></Link>
          </div>
        </section>
      )}

      {(about?.mission || about?.vision) && (
        <section className="hotel-story section">
          <span className="eyebrow">Nuestro hotel</span>
          <div>
            {about.mission && <article><h2>Misión</h2><p>{about.mission}</p></article>}
            {about.vision && <article><h2>Visión</h2><p>{about.vision}</p></article>}
          </div>
        </section>
      )}

      {showcaseRoom && (
        <section className="section rooms-showcase">
          <div className="rooms-heading">
            <div><span className="eyebrow">Tu espacio en Mocoa</span><h2>Habitaciones para hacer una pausa.</h2></div>
            <p>La distribución, capacidad y tarifa de cada habitación se confirman al consultar.</p>
          </div>
          <div className="editorial-rooms">
            <Link className="editorial-room large" to="/habitaciones">
              <Photo media={showcaseRoom.cover} thumb={false} alt="" />
              <span><small>HABITACIONES</small><strong>Espacios privados</strong><em>Explorar habitaciones ↗</em></span>
            </Link>
            {showcaseGallery && (
              <Link className="editorial-room" to="/galeria">
                <Photo media={showcaseGallery.media} alt="" />
                <span><small>GALERÍA</small><strong>Conoce los ambientes</strong><em>Ver galería ↗</em></span>
              </Link>
            )}
          </div>
          <div className="rooms-cta"><span>¿Ya tienes fechas de viaje?</span><button className="button button-light" type="button" onClick={() => booking.open()}>Consultar una habitación ↗</button></div>
        </section>
      )}

      {items.length > 0 && (
        <section className="section essentials-section">
          <div className="essentials-heading">
            {services.eyebrow && <span className="eyebrow">{services.eyebrow}</span>}
            {services.title && <h2>{services.title}</h2>}
            {services.intro && <p>{services.intro}</p>}
          </div>
          <div className="essentials-list">
            {items.map((item, i) => <div key={i}><span>{pad(i + 1)}</span><strong>{item.name}</strong><small>{item.detail}</small></div>)}
          </div>
        </section>
      )}

      {latestPosts.length > 0 && (
        <section className="section home-posts">
          <div className="preview-heading">
            <div><span className="eyebrow">Novedades</span><h2>Noticias y promociones.</h2></div>
            <Link className="text-link" to="/novedades">Ver todas ↗</Link>
          </div>
          <div className="post-grid">
            {latestPosts.map(post => (
              <article className="post-card" key={post.id}>
                {post.cover && <Link className="post-cover" to={`/novedades/${post.slug}`} tabIndex={-1} aria-hidden="true"><Photo media={post.cover} thumb alt="" /></Link>}
                <div className="post-copy">
                  <span className="post-kind">{POST_KIND[post.kind] || post.kind}</span>
                  <h3><Link to={`/novedades/${post.slug}`}>{post.title}</Link></h3>
                  {post.excerpt && <p>{post.excerpt}</p>}
                  {post.published_at && <small>{formatTsDate(post.published_at)}</small>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {preview.length > 0 && (
        <section className="photo-preview section">
          <div className="preview-heading">
            <div><span className="eyebrow">El hotel en imágenes</span><h2>Una mirada a nuestros espacios.</h2></div>
            <Link className="text-link" to="/galeria">Ver galería completa ↗</Link>
          </div>
          <div className="preview-grid">
            {preview.map((g, i) => (
              <button key={g.id} type="button" className={`preview-photo${i === 0 ? ' tall' : ''}`} onClick={() => setLightbox(i)}>
                <Photo media={g.media} thumb={i !== 0} alt={g.caption || g.media.alt_text} />
                <span>{g.caption || g.category}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="location-teaser">
        <div>
          <span className="eyebrow">Mocoa, Putumayo</span>
          <h2>Tu parada en la puerta de la Amazonía.</h2>
          <p>{settings?.address ? `Nos encuentras en ${settings.address}.` : 'Estamos en Mocoa. Consulta la ubicación y los datos de contacto del hotel.'}</p>
          <Link className="button button-outline-light" to="/contacto">Ubicación y contacto ↗</Link>
        </div>
        {facade && <Photo media={facade.media} alt={facade.caption || facade.media.alt_text} />}
      </section>

      <section className="closing-cta">
        <span className="eyebrow">Hablemos de tu visita</span>
        <h2>Cuéntanos cuándo llegas.</h2>
        <p>Prepara tu solicitud y confirma los detalles de tu estadía con el hotel.</p>
        <button className="button button-primary" type="button" onClick={() => booking.open()}>Consultar estadía ↗</button>
      </section>

      {lightbox != null && <Lightbox items={lightboxItems} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
