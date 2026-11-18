import { useEffect, useRef } from 'react';
import { useDialog } from './shared.js';

/** items: [{ src, alt, caption }]. Teclado (←, →, Esc), gesto de deslizar y foco atrapado. */
export default function Lightbox({ items, index, onIndex, onClose }) {
  const ref = useRef(null);
  const touchStart = useRef(0);
  const count = items.length;
  useDialog(ref, onClose);

  useEffect(() => {
    const onKey = e => {
      if (count < 2) return;
      if (e.key === 'ArrowRight') onIndex((index + 1) % count);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + count) % count);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [index, count, onIndex]);

  useEffect(() => { ref.current?.querySelector('[data-lightbox-close]')?.focus(); }, []);

  const item = items[index];
  if (!item) return null;
  const move = offset => onIndex((index + offset + count) % count);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Vista ampliada de imagen" ref={ref}>
      <button className="lightbox-backdrop" type="button" tabIndex={-1} aria-label="Cerrar imagen" onClick={onClose} />
      {count > 1 && <button className="icon-button lightbox-nav prev" type="button" aria-label="Imagen anterior" onClick={() => move(-1)}>←</button>}
      <figure
        onTouchStart={e => { touchStart.current = e.changedTouches[0].clientX; }}
        onTouchEnd={e => {
          const dx = e.changedTouches[0].clientX - touchStart.current;
          if (count > 1 && Math.abs(dx) > 45) move(dx < 0 ? 1 : -1);
        }}
      >
        <img src={item.src} alt={item.alt || item.caption || ''} />
        <figcaption>{[item.caption, count > 1 ? `${index + 1} / ${count}` : ''].filter(Boolean).join(' · ')}</figcaption>
        <button className="icon-button" type="button" data-lightbox-close aria-label="Cerrar" onClick={onClose}>×</button>
      </figure>
      {count > 1 && <button className="icon-button lightbox-nav next" type="button" aria-label="Imagen siguiente" onClick={() => move(1)}>→</button>}
    </div>
  );
}
