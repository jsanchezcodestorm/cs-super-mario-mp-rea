"""Compare the player's pose, Yoshi's position and each tongue tile in the PAL ROM."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, read_word, write_word
from probe_shell_contacts import flat_room, spawn
from map_tiles import PPU, vram
from boss_pixels import oam, rgba_palette


def sample(core, facing, up):
    ram = core.ram
    core.run(20, 128 if facing == 1 else 64)
    core.run(30, up)
    for frame in range(1, 37):
        core.run(1, up | (2 if frame == 1 else 0))
        length, pose = ram[0x151C], ram[0x1602]
        expect_tiles = 9 <= frame <= 35
        tongue = [i for i in range(3, 8) if ram[0x201 + 4*i] < 224]
        assert len(tongue) == (5 if expect_tiles else 0)
        assert ram[0x13E0] == (39 if frame <= 6 else 40 if frame <= 17 else 32)
        if not expect_tiles:
            continue
        sx = ram[0xE4] + 256*ram[0x14E0] - read_word(ram, 0x1A)
        sy = ram[0xD8] + 256*ram[0x14D4] - read_word(ram, 0x1C)
        lunge = frame >= 10 and not up
        assert pose == (0 if frame == 9 else 7 if lunge else 6)
        root_x = sx + (24 if lunge else 19) if facing == 1 else sx - (16 if lunge else 11)
        for i, slot in enumerate(tongue):
            entry = tuple(ram[0x200 + 4*slot:0x204 + 4*slot])
            assert entry == (root_x + facing * i * (length // 4), sy + (19 if lunge else 8),
                             0x66 if i == 4 else 0x76, 0x69 if facing == 1 else 0x29)
        if frame == 25:
            memory = vram(core)
            colors = rgba_palette(PPU.in_dll(core.lib, 'PPU'))
            head_slot = 64 + (ram[0x15EA] >> 2)
            # Drawing advances the Yoshi OAM index by one entry to its body.
            head_and_body = oam(ram, memory, colors, [head_slot-1, head_slot])[2][3::4]
            protruding = oam(ram, memory, colors, tongue)[2][3::4]
            overlap = sum(bool(a and b) for a, b in zip(head_and_body, protruding))
            assert overlap == (3 if lunge else 2), (head_slot, overlap)
            print(f'facing={facing}, up={bool(up)}, length={length}, pose={pose}, '
                  f'base=({root_x-sx},{entry[1]-sy}), spacing={length//4}, overlap={overlap}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        flat_room(core)
        ram = core.ram
        spawn(ram, image, 0, 0x35, 128)
        core.run(4)
        ram[0xC2] = ram[0x187A] = 1
        ram[0x15F6] = 10
        write_word(ram, 0x94, 128)
        write_word(ram, 0x96, 250)
        core.run(65)
        base = core.freeze()
        for facing in [-1, 1]:
            for up in [0, 16]:
                core.restore(base)
                sample(core, facing, up)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
