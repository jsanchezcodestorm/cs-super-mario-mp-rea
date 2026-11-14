"""Extract the native Layer 3 map and palette for the castle crusher."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'reference'))

from map_tiles import PPU, png, vram
from native_rooms import Core, cartridge_image, enter_room, first_course

MAP_SIDE = 512
REPEATED_WIDTH = MAP_SIDE * 2


def layer3_map(core):
    ppu = PPU.in_dll(core.lib, 'PPU')
    bg = ppu.bg[2]
    if bg.quadrants != 3:
        raise ValueError('Expected the crusher room to use a 64 by 64 Layer 3 map')

    memory = vram(core)
    map_base = 2 * bg.map
    tile_base = 2 * bg.tiles
    colors = []
    for color in ppu.cgram:
        green = color >> 5 & 31
        colors.append(bytes(((color & 31) * 255 // 31,
                             ((green << 1) | (green >> 4)) * 255 // 63,
                             (color >> 10 & 31) * 255 // 31,
                             255)))

    image = bytearray(MAP_SIDE * MAP_SIDE * 4)
    for tile_y in range(64):
        for tile_x in range(64):
            quadrant_x = tile_x // 32
            quadrant_y = tile_y // 32 * 2
            address = (map_base + (quadrant_x + quadrant_y) * 2048 +
                       ((tile_y % 32) * 32 + tile_x % 32) * 2) & 0xffff
            descriptor = memory[address] | memory[(address + 1) & 0xffff] << 8
            palette = 4 * (descriptor >> 10 & 7)
            tile = (tile_base + 16 * (descriptor & 0x3ff)) & 0xffff
            for y in range(8):
                row = (tile + 2 * (7 - y if descriptor & 0x8000 else y)) & 0xffff
                for x in range(8):
                    bit = x if descriptor & 0x4000 else 7 - x
                    pixel = ((memory[row] >> bit) & 1) | (((memory[(row + 1) & 0xffff] >> bit) & 1) << 1)
                    if pixel:
                        offset = 4 * ((tile_y * 8 + y) * MAP_SIDE + tile_x * 8 + x)
                        image[offset:offset + 4] = colors[palette + pixel]

    repeated = bytearray(REPEATED_WIDTH * MAP_SIDE * 4)
    for y in range(MAP_SIDE):
        row = image[y * MAP_SIDE * 4:(y + 1) * MAP_SIDE * 4]
        start = y * REPEATED_WIDTH * 4
        repeated[start:start + REPEATED_WIDTH * 4] = row + row
    return png(REPEATED_WIDTH, MAP_SIDE, repeated, True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()

    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        base = first_course(core)
        enter_room(core, base, '1fc')
        core.run(127)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(layer3_map(core))
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
