"""Compare facing changes on the nine E1 boss types and riderless Yoshi's OBJ data."""
import argparse
from pathlib import Path
from native_rooms import Core, cartridge_image, enter_room, read_word
from boss_animation import poses
from boss_capture import ROOMS
from probe_shell_contacts import flat_room, position, spawn


def mirrored(image):
    w, h, pixels = image
    return w, h, b''.join(pixels[4*(y*w+x):4*(y*w+x+1)] for y in range(h) for x in reversed(range(w)))


def boss_art(core, base, name, room):
    entry = enter_room(core, base, room)
    core.run(670 if name == 'bowser' else 204 - entry)
    start, ram = core.freeze(), core.ram
    sides = []
    for direction in (1, 0):
        core.restore(start)
        for _ in range(8):
            for slot in range(12):
                if ram[0x9e+slot] not in (0x29, 0xa9, 0xa0):
                    continue
                ram[0x157c+slot] = (1-direction)*128 if name == 'bowser' else direction
                for timer in (0x15ac, 0x1558, 0x1564):
                    ram[timer+slot] = 0
            ram[0x13] = ram[0x14] = 81
            core.run()
        sides.append(dict((track, image) for track, image, _ in poses(core, name)))
    left, right = sides
    assert left.keys() == right.keys()
    for track, picture in left.items():
        if name in ('lemmy', 'wendy'):
            assert right[track] == picture
        elif name == 'bowser':
            assert right[track] != picture and right[track] != mirrored(picture)
        else:
            assert right[track] == mirrored(picture)
    print(name, 'PAL facing pair:', sorted(left))


def loose_yoshi(core, image, base):
    ram = core.ram
    core.restore(base)
    spawn(ram, image, 0, 0x35, 110)
    core.run(4)
    start = core.freeze()
    for facing in (0, 1):
        for mode in ('waiting', 'running', 'growing'):
            core.restore(start)
            position(ram, 0, 116, 288)
            ram[0x157c] = facing
            ram[0xc2] = 2 if mode == 'running' else 0
            ram[0xb6] = ((-24 if facing else 24) & 255) if mode == 'running' else 0
            ram[0x18e8] = 64 if mode == 'growing' else 0
            for age in range(64):
                core.run()
                clock = ram[0x14] - 1
                pose, head = ram[0x1602], read_word(ram, 0xd8b)
                if mode == 'growing':
                    assert pose == [11, 10, 11, 10, 11, 12, 11, 12][age >> 3]
                elif mode == 'waiting':
                    assert pose == 4
                    assert head == (0x8500 if clock & 0x30 else 0x8a40)
                else:
                    assert pose == age % 3
                    assert head == (0x8680 if clock & 16 else 0x8500)
                if mode != 'growing' and age > 1:
                    slot = 64 + ram[0x15ea] // 4
                    assert ram[0x202+slot*4] == 6
                    assert bool(ram[0x203+slot*4] & 64) == (facing == 0)
            print('Yoshi', facing, mode, '64 PAL frames')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    rom = cartridge_image(args.rom)
    core = Core(args.core.resolve(), rom)
    try:
        base = flat_room(core)
        loose_yoshi(core, rom, base)
        for name, room in dict(ROOMS, lemmy='1f2', wendy='0d3').items():
            boss_art(core, base, name, room)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
