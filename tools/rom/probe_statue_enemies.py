"""Exercise the four PAL E1 Bowser statues and enemy blocks with Snes9x."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, write_word
from probe_shell_contacts import flat_room, spawn


def prepare(core, image, base, number, variant, player_x):
    core.restore(base)
    ram = core.ram
    spawn(ram, image, 0, number, 128 + 16 * variant)
    for address in (0xb6, 0xaa, 0xc2, 0x1540, 0x1570, 0x157c, 0x1602, 0x14f8, 0x14ec):
        ram[address] = 0
    ram[0x15f6] = ram[0x166e] & 15
    write_word(ram, 0x94, player_x)
    core.run()
    return ram


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        base = flat_room(core)
        for variant in range(4):
            x = 128 + 16 * variant
            ram = prepare(core, image, base, 0x4c, variant, x - 120)
            expected = (0x15, 0x0f, 0, 4)[variant]
            assert ram[0xc2] == expected
            core.run(63)
            assert ram[0x9e] == 0x4c and ram[0xb6] == 0
            core.run(4)
            assert ram[0xb6] == 4
            core.run()
            assert ram[0xb6] == 252
            write_word(ram, 0x94, x - 80)
            core.run()
            assert (ram[0x9e], ram[0xaa], ram[0x157c]) == (expected, 0xd0, 1)
            ram = prepare(core, image, base, 0xbc, variant, 32)
            assert (ram[0xc2], ram[0x157c]) == (variant, 1)
            if variant == 2:
                core.run()
                assert (ram[0x1602], ram[0x1540]) == (1, 48)
                core.run(47)
                assert (ram[0xb6], ram[0xaa], ram[0x1540]) == (240, 192, 1)
                core.run()
                assert (ram[0x1602], ram[0xe4], ram[0xd8]) == (1, x - 1, 44)
            else:
                shots = []
                for _ in range(256):
                    ram[0x1497] = 255
                    core.run()
                    for j in range(1,12):
                        if ram[0x9e+j] == 0xb3 and ram[0x14c8+j] == 8 and ram[0xe4+j] == x-16 and ram[0x14e0+j] == 0:
                            assert ram[0x157c+j] == 1
                            shots.append(ram[0x13])
                assert shots == ([128, 0] if variant & 1 else [])
        print('Four block variants shake, break and release the native enemy at vy=-3.')
        print('Statue 0 is solid, 1 and 3 fire on the 128-frame cycle, 2 faces its target and jumps at timer 1.')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
