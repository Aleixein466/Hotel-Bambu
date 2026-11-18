"""Create conservative, reproducible web variants of the supplied hotel photos.

Run from the repository root: python scripts/process_photos.py
The original WhatsApp JPEGs in fotos-originales are never modified.
"""

from pathlib import Path
from PIL import Image, ImageEnhance, ImageOps, ImageFilter

SOURCE = Path('fotos-originales')
OUTPUT = Path('public/assets/hotel')
OUTPUT.mkdir(parents=True, exist_ok=True)

PHOTOS = {
    'entrada': 'WhatsApp Image 2026-10-15 at 2.50.41 PM.jpeg',
    'letrero': 'WhatsApp Image 2026-10-15 at 2.50.41 PM (1).jpeg',
    'sala': 'WhatsApp Image 2026-10-15 at 2.50.42 PM.jpeg',
    'pasillo': 'WhatsApp Image 2026-10-15 at 2.50.26 PM.jpeg',
    # 'recepcion' excluida: muestra personas y el monitor de cámaras de seguridad.
    'bano': 'WhatsApp Image 2026-10-15 at 2.50.24 PM (2).jpeg',
    'habitacion-blanca': 'WhatsApp Image 2026-10-15 at 2.50.40 PM.jpeg',
    'habitacion-blanca-2': 'WhatsApp Image 2026-10-15 at 2.50.40 PM (1).jpeg',
    'habitacion-camas': 'WhatsApp Image 2026-10-15 at 2.50.25 PM (1).jpeg',
    'habitacion-camas-2': 'WhatsApp Image 2026-10-15 at 2.50.38 PM.jpeg',
    'habitacion-verde': 'WhatsApp Image 2026-10-15 at 2.50.31 PM (1).jpeg',
    'habitacion-verde-2': 'WhatsApp Image 2026-10-15 at 2.50.33 PM (1).jpeg',
    'habitacion-azul': 'WhatsApp Image 2026-10-15 at 2.50.36 PM (2).jpeg',
    'habitacion-azul-2': 'WhatsApp Image 2026-10-15 at 2.50.37 PM.jpeg',
    'habitacion-sencilla': 'WhatsApp Image 2026-10-15 at 2.50.23 PM (1).jpeg',
    'habitacion-doble': 'WhatsApp Image 2026-10-15 at 2.50.29 PM (1).jpeg',
}

for name, filename in PHOTOS.items():
    with Image.open(SOURCE / filename) as original:
        photo = ImageOps.exif_transpose(original).convert('RGB')
        # Gentle tonal correction only; no geometry or scene elements are changed.
        photo = ImageOps.autocontrast(photo, cutoff=0.35, preserve_tone=True)
        photo = ImageEnhance.Brightness(photo).enhance(1.025)
        photo = photo.filter(ImageFilter.UnsharpMask(radius=1, percent=45, threshold=4))
        for suffix, max_edge, quality in (('', 1280, 84), ('-thumb', 560, 79)):
            variant = photo.copy()
            variant.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            target = OUTPUT / f'{name}{suffix}.webp'
            variant.save(target, 'WEBP', quality=quality, method=6)
            print(f'{target}: {variant.width}x{variant.height}, {target.stat().st_size // 1024} KB')
