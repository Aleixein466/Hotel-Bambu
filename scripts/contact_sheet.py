from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

source = Path('fotos-originales')
Path('artifacts').mkdir(exist_ok=True)
files = sorted(source.glob('*.jpeg'))
width, height = 240, 186
sheet = Image.new('RGB', (width * 5, height * ((len(files) + 4) // 5)), '#eee9df')
draw = ImageDraw.Draw(sheet)
for index, path in enumerate(files):
    with Image.open(path) as original:
        photo = original.copy()
        photo.thumbnail((width - 12, height - 42))
        x = (index % 5) * width + (width - photo.width) // 2
        y = (index // 5) * height + 5
        sheet.paste(photo, (x, y))
        draw.text(((index % 5) * width + 8, (index // 5) * height + height - 30), f'{index + 1:02d}  {original.width}x{original.height}', fill='#222')
sheet.save('artifacts/contact-sheet.jpg', quality=85)
for index, path in enumerate(files):
    print(f'{index + 1:02d}: {path.name}')
