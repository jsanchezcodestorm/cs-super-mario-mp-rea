"""Hatch the second pink berry's coin-game cloud twice and compare nine versus ten pickups."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, read_word
from probe_player_contacts import put_tile
from probe_shell_contacts import STATUS
from probe_yoshi_food import mounted, score, sprite_xy


def active_sprite(ram, number):
    return next((slot for slot in range(12)
                 if ram[STATUS + slot] == 8 and ram[0x9E + slot] == number), None)


def collect_in_place(ram):
    # Reposition the extended coin over the rider. The PAL collision routine
    # performs the pickup, updates the cloud's count and creates the score sprite.
    for slot in range(8):
        if ram[0x170B + slot] == 0x0A:
            x, y = read_word(ram, 0x94), read_word(ram, 0x96) + 22
            ram[0x171F + slot], ram[0x1733 + slot] = x & 255, x >> 8
            ram[0x1715 + slot], ram[0x1729 + slot] = y & 255, y >> 8


def measure(core, scene, target):
    core.restore(scene)
    ram = core.ram
    x, y = sprite_xy(ram, 0)
    put_tile(ram, (x + 20) // 16, (y + 8) // 16, 0x46)
    ram[0x18D5] = 1
    for hatched in range(1, 401):
        core.run()
        cloud = active_sprite(ram, 0x6A)
        if cloud is not None:
            break
    else:
        raise AssertionError('The pink berry egg did not hatch a coin-game cloud')
    drops = []
    for frame in range(1, 1601):
        # Keep the cloud within the flat test area, where all sprites stay loaded.
        ram[0xE4 + cloud], ram[0x14E0 + cloud] = 115, 0
        previous = ram[0x1570 + cloud]
        if ram[0x18E3] < target:
            collect_in_place(ram)
        core.run()
        if ram[0x1570 + cloud] != previous:
            drops.append(frame)
            if len(drops) == 11:
                break
    assert len(drops) == 11 and all(b - a == 128 for a, b in zip(drops, drops[1:])), drops
    assert (ram[0xDBF], score(ram, 0)) == (target + 1, target * 100)
    assert (active_sprite(ram, 0x78) is not None) == (target == 10)
    print(f'Cloud hatched after {hatched} PAL frames. Collected {target}/10 dropped coins, '
          f'{score(ram, 0)} points; 1-UP at drop 11: {target == 10}.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        scene = mounted(core, image)
        for target in (9, 10):
            measure(core, scene, target)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
