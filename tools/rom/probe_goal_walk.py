"""Follow the PAL goal-tape walk, peace sign, iris and overworld transition."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, read_word, write_word
from probe_shell_contacts import flat_room, spawn


def sample(core, image, base, player, mounted):
    core.restore(base)
    r = core.ram
    r[0xdb3] = player
    if mounted:
        spawn(r, image, 1, 0x35, 96)
        core.run(4)
        r[0xc2+1] = r[0x187a] = 1
        r[0x15f6+1] = 10
    spawn(r, image, 0, 0x7b, 100)
    core.run(10)
    write_word(r, 0x94, 99)
    write_word(r, 0x96, 288)
    salute = 20 if mounted else 38
    poses = []
    samples = {}
    for _ in range(60):
        core.run()
        if r[0x1493] == 255:
            break
    assert r[0x1493] == 255
    origin = read_word(r, 0x94)
    for age in range(600):
        if age:
            core.run()
        if r[0x100] != 20:
            break
        poses.append(r[0x13e0])
        if age in (0, 60, 120, 240, 358, 468, 530):
            samples[age] = (read_word(r, 0x94) - origin, r[0x13e0], r[0x1433])
    assert age in range(515, 555), (age, samples, r[0x1493], r[0x187a])
    assert poses.count(salute) >= 110
    print('seat', player+1, 'mounted', mounted, 'first salute', poses.index(salute),
          'map', age, 'samples (deltaX,pose,iris)', samples)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        base = flat_room(core)
        for player in range(2):
            for mounted in (False, True):
                sample(core, image, base, player, mounted)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
