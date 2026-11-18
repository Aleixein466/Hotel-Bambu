import { mediaUrl } from '../lib/media.js';

/** Texto plano en párrafos (separados por líneas en blanco). React escapa el contenido. */
export function Paragraphs({ text, className }) {
  const parts = String(text || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  return parts.map((p, i) => <p key={i} className={className} style={{ whiteSpace: 'pre-line' }}>{p}</p>);
}

export const ConceptBadge = ({ media }) => (media?.is_concept ? <span className="concept-badge">Imagen ilustrativa</span> : null);

/** Imagen pública con su insignia de "ilustrativa" cuando corresponde. */
export function Photo({ media, thumb = false, alt, ...props }) {
  if (!media) return null;
  return <img src={mediaUrl(media, { thumb })} alt={alt ?? media.alt_text ?? ''} loading="lazy" {...props} />;
}
