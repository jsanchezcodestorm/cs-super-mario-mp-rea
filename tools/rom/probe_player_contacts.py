"""Measure jumps and head contacts in the PAL E1 engine with Snes9x."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word


def measure_jump(core, button, held_frames):
    ram = core.ram
    floor = read_word(ram, 0x96)
    apex = floor
    first_ceiling = None
    airborne = False
    for frame in range(1, 121):
        core.run(1, button if frame <= held_frames else 0)
        y = read_word(ram, 0x96)
        apex = min(apex, y)
        if ram[0x77] & 8 and first_ceiling is None:
            # Small Mario's head interaction point is native Y + 16.
            first_ceiling = y + 16
        if not ram[0x77] & 4:
            airborne = True
        elif airborne:
            return floor - apex, frame, first_ceiling
    raise RuntimeError('Mario did not land within 120 PAL frames')


def foreground_address(col, row):
    # Row-major columns within each horizontal level screen, 27 rows per screen.
    return 0xc800 + (col // 16) * 432 + row * 16 + col % 16


def put_tile(ram, col, row, tile):
    address = foreground_address(col, row)
    ram[address] = tile & 255
    ram[0x10000 + address] = tile >> 8


def ceiling_probe(core, base):
    enter_room(core, base, '11a')
    ram = core.ram
    # Controlled geometry in the Vanilla Dome cave tileset isolates a single
    # hitbox query from sprite contact and camera movement.
    for col in range(16):
        for row in range(9, 19):
            put_tile(ram, col, row, 0x130 if row == 18 else 0x25)
    for slot in range(12):
        ram[0x14c8 + slot] = 0
    room = core.freeze()
    for tile in (0x100, 0x130, 0x1c4, 0x1c5):
        for x in (2, 9):
            core.restore(room)
            put_tile(ram, 4, 14, tile)
            write_word(ram, 0x94, 64 + x - 8)
            write_word(ram, 0x96, 18 * 16 - 32)
            ram[0x7b] = ram[0x7d] = 0
            core.run(15)
            _, _, head = measure_jump(core, 1, 120)
            print(f'Map16 {tile:03X}, local X {x}, first blocked head Y {head}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        base = first_course(core)
        for label, button in [('B', 1), ('A', 256)]:
            for held in (1, 5, 10, 120):
                core.restore(base)
                height, landing, _ = measure_jump(core, button, held)
                print(f'Button {label}, held {held} PAL frames, rise {height} px, landing frame {landing}')
        ceiling_probe(core, base)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
