import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, unwrap } from '../lib/supabase.js';
import { mediaUrl, uploadImage, ACCEPTED_TYPES } from '../lib/media.js';
import { Loading, ErrorState, EmptyState, useToast } from './Feedback.jsx';

export function useMediaLibrary() {
  return useQuery({
    queryKey: ['admin', 'media'],
    queryFn: () => unwrap(supabase.from('media_assets').select('*').order('created_at', { ascending: false })),
  });
}

/** Zona para arrastrar/soltar o elegir archivos. Sube y llama onUploaded(rows). */
export function UploadDropzone({ onUploaded, multiple = true, label = 'Arrastra fotografías aquí o haz clic para elegirlas' }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(null);
  const [errors, setErrors] = useState([]);
  const qc = useQueryClient();
  const toast = useToast();

  async function handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const done = [];
    const problems = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length, name: files[i].name });
      try {
        done.push(await uploadImage(files[i]));
      } catch (error) {
        problems.push(error.message);
      }
    }
    setProgress(null);
    setErrors(problems);
    if (done.length) {
      await qc.invalidateQueries({ queryKey: ['admin', 'media'] });
      toast.success(done.length === 1 ? 'Imagen subida y guardada.' : `${done.length} imágenes subidas y guardadas.`);
      onUploaded?.(done);
    }
    if (problems.length) toast.error(`${problems.length} archivo(s) no se subieron.`);
    if (input.current) input.current.value = '';
  }

  return (
    <div>
      <div
        className={`dropzone ${drag ? 'dragging' : ''}`}
        role="button" tabIndex={0}
        onClick={() => !progress && input.current?.click()}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !progress) { e.preventDefault(); input.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (!progress) handleFiles(e.dataTransfer.files); }}
        aria-busy={Boolean(progress)}
      >
        {progress ? <span role="status">Optimizando y subiendo {progress.current} de {progress.total}: {progress.name}…</span> : <span>{label}</span>}
        <small>JPG, PNG o WebP · máx. 15 MB · mínimo 400 px · se optimiza a WebP y se eliminan metadatos</small>
        <input ref={input} type="file" accept={ACCEPTED_TYPES.join(',')} multiple={multiple} hidden data-testid="media-file-input"
          onChange={e => handleFiles(e.target.files)} />
      </div>
      {errors.length > 0 && <ul className="form-error" role="alert">{errors.map(m => <li key={m}>{m}</li>)}</ul>}
    </div>
  );
}

export function MediaThumb({ media, className = '' }) {
  if (!media) return <span className={`media-thumb empty ${className}`} aria-hidden="true" />;
  return <img className={`media-thumb ${className}`} src={mediaUrl(media, { thumb: true })} alt={media.alt_text || ''} loading="lazy" />;
}

/**
 * Selector modal de la biblioteca con carga integrada.
 * props: open, onClose, onSelect(mediaRows[]), multiple, title
 */
export function MediaPicker({ open, onClose, onSelect, multiple = false, title = 'Elegir imagen' }) {
  const { data, isLoading, error, refetch } = useMediaLibrary();
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const card = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setSelected([]);
    const previous = document.activeElement;
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    setTimeout(() => card.current?.querySelector('input,button')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [open, onClose]);

  if (!open) return null;
  const term = search.trim().toLowerCase();
  const items = (data || []).filter(m => !term || `${m.title} ${m.alt_text}`.toLowerCase().includes(term));
  const toggle = media => setSelected(list => {
    if (!multiple) return [media];
    return list.some(m => m.id === media.id) ? list.filter(m => m.id !== media.id) : [...list, media];
  });

  return (
    <div className="modal-shell">
      <button className="modal-backdrop" type="button" aria-label="Cerrar" onClick={onClose} />
      <div className="modal-card wide" role="dialog" aria-modal="true" aria-labelledby="media-picker-title" ref={card}>
        <div className="modal-head">
          <h2 id="media-picker-title">{title}</h2>
          <button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}>×</button>
        </div>
        <UploadDropzone multiple={multiple} onUploaded={rows => setSelected(list => (multiple ? [...rows, ...list] : [rows[0]]))} />
        <label className="search-field">Buscar en la biblioteca
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Título o texto alternativo" />
        </label>
        {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={refetch} /> : items.length === 0 ? <EmptyState title="No hay imágenes" /> : (
          <ul className="media-grid" aria-label="Biblioteca de imágenes">
            {items.map(m => {
              const isSelected = selected.some(s => s.id === m.id);
              return (
                <li key={m.id}>
                  <button type="button" className={`media-option ${isSelected ? 'selected' : ''}`} aria-pressed={isSelected} onClick={() => toggle(m)}>
                    <MediaThumb media={m} />
                    <span>{m.title || 'Sin título'}{m.is_concept ? ' · ilustrativa' : ''}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="modal-actions">
          <button type="button" className="button button-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="button button-primary" disabled={!selected.length} onClick={() => { onSelect(selected); onClose(); }}>
            {multiple ? `Usar ${selected.length || ''} seleccionada(s)` : 'Usar imagen'}
          </button>
        </div>
      </div>
    </div>
  );
}
