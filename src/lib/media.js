import { SUPABASE_URL, supabase, unwrap, toAppError } from './supabase.js';

export const MEDIA_BUCKET = 'media';
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // archivo original
export const MIN_DIMENSION = 400;
const MAX_EDGE = 2000;
const THUMB_EDGE = 640;

/** URL pública estable de un recurso (bundled = incluido en el sitio, storage = Supabase). */
export function mediaUrl(media, { thumb = false } = {}) {
  if (!media) return '';
  const path = thumb && media.thumb_path ? media.thumb_path : media.path;
  if (media.source === 'bundled') return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Valida tipo, tamaño y dimensiones. Lanza Error con mensaje legible. */
export async function validateImageFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error(`"${file.name}": formato no permitido. Usa JPG, PNG o WebP.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`"${file.name}": supera 15 MB.`);
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error(`"${file.name}": el archivo no es una imagen válida.`);
  }
  if (Math.min(bitmap.width, bitmap.height) < MIN_DIMENSION) {
    bitmap.close();
    throw new Error(`"${file.name}": mínimo ${MIN_DIMENSION} px por lado (tiene ${bitmap.width}×${bitmap.height}).`);
  }
  return bitmap;
}

function encode(bitmap, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve({ blob, width, height }) : reject(new Error('No se pudo procesar la imagen.'))), 'image/webp', quality));
}

/**
 * Optimiza (WebP, máx. 2000 px, sin metadatos EXIF/GPS), sube original optimizado + miniatura
 * con rutas únicas e inmutables y registra el recurso. Devuelve la fila media_assets.
 */
export async function uploadImage(file, { alt = '', title = '' } = {}) {
  const bitmap = await validateImageFile(file);
  let main, thumb;
  try {
    main = await encode(bitmap, MAX_EDGE, 0.86);
    thumb = await encode(bitmap, THUMB_EDGE, 0.8);
  } finally {
    bitmap.close();
  }
  const id = crypto.randomUUID();
  const month = new Date().toISOString().slice(0, 7).replace('-', '/');
  const path = `uploads/${month}/${id}.webp`;
  const thumbPath = `uploads/${month}/${id}-thumb.webp`;
  const storage = supabase.storage.from(MEDIA_BUCKET);
  const options = { contentType: 'image/webp', cacheControl: '31536000', upsert: false };

  const up1 = await storage.upload(path, main.blob, options);
  if (up1.error) throw toAppError(up1.error);
  const up2 = await storage.upload(thumbPath, thumb.blob, options);
  if (up2.error) {
    await storage.remove([path]);
    throw toAppError(up2.error);
  }
  try {
    return await unwrap(supabase.from('media_assets').insert({
      source: 'storage', path, thumb_path: thumbPath, mime_type: 'image/webp',
      width: main.width, height: main.height, size_bytes: main.blob.size,
      alt_text: alt.slice(0, 300), title: (title || file.name.replace(/\.[^.]+$/, '')).slice(0, 120),
    }).select().single());
  } catch (error) {
    await storage.remove([path, thumbPath]);
    throw error;
  }
}

/** Elimina un recurso si no está en uso (la base de datos lo verifica) y sus archivos. */
export async function deleteMedia(mediaId) {
  const rows = await unwrap(supabase.rpc('delete_media', { p_media_id: mediaId }));
  const row = rows?.[0];
  if (row?.source === 'storage') {
    const files = [row.path, row.thumb_path].filter(Boolean);
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).remove(files);
    // Storage no informa error cuando una política impide borrar: se verifica la lista devuelta.
    if (error || (data?.length ?? 0) < files.length) throw new Error('El registro se eliminó, pero el archivo quedó en el almacenamiento. Usa "Limpiar huérfanos".');
  }
  return row;
}
