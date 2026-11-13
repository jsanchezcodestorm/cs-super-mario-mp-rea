"""Measure the E1 P-switch countdown in room 1DD at all four frame phases."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, write_word


def measure(core, scene, position, delay):
    core.restore(scene)
    ram = core.ram
    x, y = position
    write_word(ram, 0x94, x - 46)
    core.run(delay)
    write_word(ram, 0x94, x)
    write_word(ram, 0x96, y - 34)
    ram[0x7d] = 16
    changes = []
    for frame in range(720):
        core.run()
        value = ram[0x14ad]
        if not changes and not value:
            continue
        if not changes or changes[-1][1] != value:
            changes.append((frame, value, ram[0x14] & 3))
        if value == 0:
            return changes
    raise RuntimeError('P-switch did not activate and expire in the recording')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        enter_room(core, first_course(core), '1dd')
        core.run(20)
        ram = core.ram
        slot = next(i for i in range(12) if ram[0x14c8+i] and ram[0x9e+i] == 0x3e)
        xy = ram[0xe4+slot] + 256 * ram[0x14e0+slot], ram[0xd8+slot] + 256 * ram[0x14d4+slot]
        scene = core.freeze()
        for offset in range(4):
            samples = measure(core, scene, xy, offset)
            start, end = samples[0], samples[-1]
            print(f'phase {start[2]}, timer {start[1]:02X}, active for {end[0]-start[0]} PAL frames')
            assert start[1] == 0xb0 and end[1] == 0
            assert all(b[0] - a[0] == 4 for a, b in zip(samples[1:], samples[2:]))
            assert end[0] - start[0] == 4 * 0xb0 - start[2]
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
