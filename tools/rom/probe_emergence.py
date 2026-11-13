"""Measure the pipe and power-up OAM transitions on PAL E1."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, write_word
from probe_bonus_questions import hit


def visible_objects(ram):
    return {i: (ram[0x203 + 4*i] >> 4) & 3 for i in range(128) if ram[0x201 + 4*i] < 224}


def pipes(core, base):
    ram = core.ram
    for mounted in (False, True):
        core.restore(base)
        ram[0xDC1] = ram[0x187A] = int(mounted)
        start = core.freeze()
        for room, action, frames in [('0bd', 5, 28), ('1f0', 4, 28), ('0c6', 6, 30), ('1c9', 7, 15)]:
            enter_room(core, start, room)
            for i in range(12):
                if not mounted or ram[0x9E+i] != 0x35:
                    ram[0x14C8+i] = 0
            duration = frames + ((26 if action < 6 else 10) if mounted else 0)
            assert (ram[0x89], ram[0x88], ram[0x13F9]) == (action, duration-1, 2)
            core.run(3)
            during = visible_objects(ram)
            assert during[68] == during[69] == 1 and set(during.values()) == {1}
            if mounted:
                assert ram[0x187A] and len(during) > 2
            core.run(duration-3)
            assert ram[0x71] == ram[0x13F9] == 0
            core.run(2)
            after = visible_objects(ram)
            assert after[68] == after[69] == 2 and set(after.values()) == {2}, after
            print(f'{room} mounted={mounted}, {duration} PAL frames, visible OBJ1 -> OBJ2')


def mushroom(core, base):
    enter_room(core, base, '0bd')
    core.run(90)
    hit(core, 4, 1)
    hit(core, 7, 1)
    ram = core.ram
    write_word(ram, 0x94, 160)
    write_word(ram, 0x96, 336)
    ram[0x7B], ram[0x7D], ram[0x72], ram[0x13] = 0, 0xC0, 1, 0
    for frame in range(1, 64):
        core.run()
        slot = next(i for i in range(12) if ram[0x9E+i] == 0x78 and ram[0x14C8+i] == 8)
        offset = 0x300 + ram[0x15EA+slot]
        assert ram[0x1540+slot] == max(0, 62-frame)
        if frame <= 8:
            assert ram[offset+1] >= 224
        else:
            assert ram[offset+1] < 224 and ram[offset+2] == 0x24
            assert (ram[offset+3] >> 4) & 3 == (1 if frame < 62 else 2)
        if frame == 61:
            assert ram[0xD8+slot] + 256 * ram[0x14D4+slot] == 320
    print('0bd 1-UP: hidden frames 1-8, OBJ1 on 9-61, OBJ2 from 62, Y=320 at release.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        base = first_course(core)
        pipes(core, base)
        mushroom(core, base)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
