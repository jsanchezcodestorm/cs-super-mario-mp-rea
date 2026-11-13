"""Extract BG3 water from the five PAL tide rooms and check it against native frames."""
import argparse
import struct
from pathlib import Path

from boss_capture import LayerSwitch
from boss_pixels import png
from hud_tiles import StatusPlane, canvas, stamp
from map_tiles import PPU
from native_rooms import Core, cartridge_image, enter_room, first_course

TIDE_ROOMS = ('002', '102', '127', '0be', '0c1')


def water_tiles(core):
    plane = StatusPlane(core)
    # The water begins on tile row 32 of a 64x64 screen map. Quadrants
    # are in screen order, each holding 32x32 tile words.
    quadrant = plane.map + 2 * 2048
    result = canvas(16, 16)
    for row in range(2):
        for col in range(2):
            word = struct.unpack_from('<H', plane.memory, quadrant + row*64 + col*2)[0]
            stamp(result, plane.tile(word), col*8, row*8)
    return result


def rgb565(rgba):
    r, g, b, _ = rgba
    return round(31*r/255) << 11 | round(63*g/255) << 5 | round(31*b/255)


def compare_raster(core, switch, sheet):
    state = core.freeze()
    clear = switch.capture(state, 31)
    full = switch.capture(state, 0)
    water = switch.capture(state, 31 ^ 4)
    bg = PPU.in_dll(core.lib, 'PPU').bg[2]
    top = 248 - bg.y  # Tile row 32 minus the eight cropped scanlines.
    pixels = sheet[2]
    checked = 0
    for y in range(top, 224):
        row = y-top if y-top < 8 else 8 + (y-top) % 8
        for x in range(256):
            pos = 4 * (row*16 + ((x + bg.x) & 15))
            alpha = pixels[pos+3]
            i = y*256 + x
            expected = rgb565(pixels[pos:pos+4]) if alpha else clear[i]
            if water[i] != expected or (alpha and full[i] != expected):
                raise AssertionError(f'Tide mismatch at ({x}, {y})')
            checked += 1
    core.restore(state)
    return checked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        core.capture_video = True
        switch = LayerSwitch(core)
        base = first_course(core)
        reference = None
        checked = 0
        for room in TIDE_ROOMS:
            switch.show(0)
            enter_room(core, base, room)
            core.run(45)
            for frame in range(128):
                core.run()
                sheet = water_tiles(core)
                if reference is None:
                    reference = sheet
                if reference != sheet:
                    raise ValueError(f'Unexpected tile or palette change in room {room}, frame {frame}')
                if frame in (0, 63, 127):
                    checked += compare_raster(core, switch, sheet)
                    switch.show(0)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(png(*reference))
        print(f'BG3 water: 5 rooms, 640 frame samples and {checked} raster pixels matched.')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
