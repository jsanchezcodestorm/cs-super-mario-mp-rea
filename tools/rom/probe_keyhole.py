"""Follow a held key into the E1 keyhole and compare each active HDMA scanline."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, read_word, write_word
from probe_shell_contacts import flat_room, spawn, position


def measure(core, rom, base, seat):
    core.restore(base)
    r = core.ram
    r[0xdb3] = seat
    core.input_port = seat
    spawn(r, rom, 1, 0x0e, 112)
    spawn(r, rom, 2, 0x80, 108)
    core.run(4)
    write_word(r, 0x94, 107)
    write_word(r, 0x96, 288)
    position(r, 2, 110)
    r[0x14c8 + 2] = 11  # Held key. Let sprite $0E detect the overlap.
    widths = rom[0x4b86:0x4c06]
    checked = 0
    for age in range(153):
        core.run(1, 2)
        radius = r[0x1433]
        expected = min(age*4, 144, max(0, (120-age)*4))
        assert radius == expected, (age, radius)
        if age <= 120:
            assert r[0x1435] == int(age >= 84) and r[0x100] == 20
        if not radius:
            continue
        cx = read_word(r, 0x1436) - read_word(r, 0x1a) + 4
        cy = read_word(r, 0x1438) - read_word(r, 0x1c) + 16
        for y in range(224):
            dy = cy - y
            span = (255, 0)
            if 0 < dy < radius:
                half = widths[dy*128//radius]*radius//256
                span = (max(0, cx-half), min(255, cx+half))
            actual = tuple(r[0x4a0+2*y:0x4a2+2*y])
            assert span == actual, (age, y, span, actual)
            checked += 1
    assert r[0x100] == 12 and r[0x0dae] == 0
    print(f'Pad {seat+1}: {checked} HDMA scanlines, 36 expansion, 48 hold, 36 contraction, fade to zero at 152')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        base = flat_room(core)
        for seat in range(2):
            measure(core, image, base, seat)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
