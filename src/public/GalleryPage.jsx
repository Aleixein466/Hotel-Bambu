import { useState } from 'react';
import { usePublicGallery } from '../api/public.js';
import { mediaUrl } from '../lib/media.js';
import { EmptyState, ErrorState, Loading } from '../ui/Feedback.jsx';
import Lightbox from './Lightbox.jsx';
import { ConceptBadge, Photo } from './parts.jsx';
import { usePageTitle } from './shared.js';

export default function GalleryPage() {
  usePageTitle('Galería');
  const { data, isLoading, error, refetch } = usePublicGallery();
  const [category, setCategory] = useState('Todas');
  const [lightbox, setLightbox] = useState(null);

  const items = data || [];
  const categories = [...new Set(items.map(i => i.category).filter(Boolean))];
  const shown = items.filter(i => category === 'Todas' || i.category === category);
  const caption = item => item.caption || item.media.alt_text || '';
  const lightboxItems = shown.map(i => ({ src: mediaUrl(i.media), alt: i.media.alt_text || caption(i), caption: caption(i) }));

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">Galería fotográfica</span>
        <h1>Así se ve Bambú Plaza.</h1>
        <p>Fotografías de habitaciones, espacios comunes y entrada del hotel. La asignación exacta de cada habitación se confirma al consultar.</p>
      </section>
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {data && (items.length === 0 ? <EmptyState title="Aún no hay fotografías publicadas." /> : (
        <>
          <div className="toolbar">
            <div className="filter-chips" role="group" aria-label="Filtrar fotografías">
              {['Todas', ...categories].map(c => (
                <button key={c} type="button" className={`chip${category === c ? ' active' : ''}`} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>
            <span id="gallery-count">{shown.length} {shown.length === 1 ? 'fotografía' : 'fotografías'}</span>
          </div>
          <section className="gallery-page">
            <div className="gallery-masonry">
              {shown.map((item, i) => (
                <button key={item.id} type="button" className="gallery-tile" onClick={() => setLightbox(i)}>
                  <Photo media={item.media} thumb alt={item.media.alt_text || caption(item)} />
                  <ConceptBadge media={item.media} />
                  <span>{caption(item)}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      ))}
      {lightbox != null && <Lightbox items={lightboxItems} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}
