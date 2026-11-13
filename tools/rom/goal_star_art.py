"""Extract the goal tape's star-shaped numerals from E1 ROM and live OBJ VRAM."""
import json

from boss_pixels import oam, png
from hud_tiles import canvas, crop, stamp
from map_tiles import vram

# Full-size star, then the tile table at $07:F24E indexed by the shrinking timer.
TILES = (0xef, 0xff, 0x6e, 0x66)


def digit_offsets(rom, digit):
    start = rom[0x3f1a0 + digit]
    points = []
    for index in range(start, start + 14):
        x, y = rom[0x3f0c8 + index], rom[0x3f134 + index]
        if x == 255:
            return points
        points.append((x, y))
    raise ValueError(f'Unterminated E1 goal-star digit {digit}')


def sprite_color(color):
    # Convert the catalog's RGB24 back to the RGB565 output of our SNES core.
    r, g, b = color >> 19, color >> 11 & 31, color >> 3 & 31
    return bytes((r*255//31, ((g << 1) | (g >> 4))*255//63, b*255//31, 255))


def export_goal_stars(core, rom, output, catalog_path):
    catalog = json.loads(catalog_path.read_text())
    palettes, rows = {}, {}
    for room, level in catalog['levels'].items():
        if not any(sprite['spriteId'] == 0x7b for sprite in level['sprites']):
            continue
        rows[room] = []
        for base in range(128, 256, 16):
            colors = level['spritePalette']
            # Only palette entries 1 and 5 are present in the four OBJ tiles.
            pair = (colors[base + 1], colors[base + 5])
            rows[room].append(palettes.setdefault(pair, len(palettes)))

    ram, memory = bytearray(core.ram), vram(core)
    sheet = canvas(8*len(TILES), 8*len(palettes))
    colors = [bytes(4)] * 256
    for pair, row in palettes.items():
        colors[129], colors[133] = map(sprite_color, pair)
        for column, tile in enumerate(TILES):
            ram[0x200:0x204] = bytes((0, 0, tile, 0x30))
            ram[0x420] = 0
            stamp(sheet, crop(oam(ram, memory, colors, [0]), 0, 0, 8, 8), column*8, row*8)
    (output / 'goal-stars.png').write_bytes(png(*sheet))
    layout = {'digits': [digit_offsets(rom, digit) for digit in range(10)], 'rows': rows}
    (output / 'goal-stars.json').write_text(json.dumps(layout, separators=(',', ':')))
