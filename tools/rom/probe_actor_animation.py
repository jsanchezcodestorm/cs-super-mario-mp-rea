"""Measure standard sprite and Koopa shell OBJ timing in the PAL E1 ROM."""
import sys
from pathlib import Path

from native_rooms import Core, cartridge_image
from probe_shell_contacts import flat_room, position, spawn


def sprite_oam(r):
    first = 64 + r[0x15ea] // 4
    return [(r[0x202+4*i], r[0x203+4*i]) for i in range(first, min(first+4, 128))
            if r[0x201+4*i] < 224]


def measure(core, image, base, number, status, direction):
    core.restore(base)
    r = core.ram
    spawn(r, image, 0, number, 120)
    core.run()
    initial = sprite_oam(r)
    r[0x14c8] = status
    r[0x1540] = 0xff if status == 9 else 0
    r[0x157c] = int(direction < 0)
    r[0xb6] = (direction * (48 if status == 10 else 0)) & 255
    samples = {}
    for _ in range(64):
        position(r, 0, 120)
        core.run()
        samples[r[0x14] & 31] = sprite_oam(r)
    print(hex(number), 'status', status, 'direction', direction, 'init', initial,
          'active', sum(bool(v) for v in samples.values()), '/32',
          [(f, v) for f, v in sorted(samples.items()) if v != samples[(f-1) % 32]] or samples[0])
    return samples


if __name__ == '__main__':
    image = cartridge_image(Path(sys.argv[2]))
    core = Core(Path(sys.argv[1]), image)
    try:
        base = flat_room(core)
        for i in [4, 0x0f, 0x74, 0x75, 0x78, 0x83, 0x84, 0x55]:
            samples = measure(core, image, base, i, 8, 0)
            assert all(samples.values()), hex(i)
        for status, direction in [(9, 0), (10, -1), (10, 1)]:
            measure(core, image, base, 4, status, direction)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
