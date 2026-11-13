"""Measure the two PAL rope clips, their input latches and open ends in Snes9x."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word
from probe_pipe_plants import position_observer, sprite_position

B, UP, DOWN, LEFT, RIGHT, A = 1, 16, 32, 64, 128, 256


def sample_motor(core, base, room, x, y, long_rope):
    enter_room(core, base, room)
    core.run(30)
    ram = core.ram
    for px in range(read_word(ram, 0x94), max(96, x - 70), 3):
        position_observer(core, px, y - 48)
    slot = next(i for i in range(12) if ram[0x14c8+i] == 8 and ram[0x9e+i] == 0x64
                and abs(sprite_position(ram, i)[0] - x) < 8)
    assert ram[0x1662+slot] & 63 == 0x12 + long_rope
    parked = core.freeze()

    def place(form, dx, dy, buttons):
        core.restore(parked)
        ram[0x19] = form
        ram[0x7b] = ram[0x7d] = 0
        ram[0x1497] = 240
        write_word(ram, 0x94, x + dx)
        write_word(ram, 0x96, y + dy)
        core.run(1, buttons)

    def relative():
        px, py = sprite_position(ram, slot)
        return read_word(ram, 0x94) - px, read_word(ram, 0x96) - py

    for form in (0, 1):
        low = 48 + 14 * form + 64 * long_rope
        for dx in (-19, -18, 2, 3):
            place(form, dx, 30, UP)
            assert bool(ram[0x18be]) == (-18 <= dx <= 2)
        for dy in (-17, -16, low, low+1):
            place(form, -8, dy, UP)
            assert bool(ram[0x18be]) == (-16 <= dy <= low)
        print(room, 'form', form, 'grip X [-18,+2], Y [-16,' + str(low) + '] from motor')
        for key in (0, DOWN, LEFT, RIGHT, A):
            place(form, -8, 30, key)
            assert ram[0x18be] == 0
        place(form, -8, 30, UP)
        core.run(5, UP)
        core.run(3)
        held = core.freeze()
        for key in (0, LEFT, RIGHT, A, B):
            core.restore(held)
            start = relative()
            core.run(1, key)
            if key == B:
                assert ram[0x18be] == 0 and ram[0x7d] == 0xb0
                continue
            core.run(70, key)
            assert ram[0x18be] == 8 and ram[0x74] == 31 and relative() == start
        if not long_rope:
            for key, edge in ((UP, -17), (DOWN, low+1)):
                core.restore(held)
                for _ in range(140):
                    core.run(1, key)
                    if not ram[0x18be]:
                        break
                assert ram[0x18be] == 0 and relative()[1] == edge
            print('short motor: ascending detaches at -17; descending at', low+1)
    print('Up captures, B jumps, A and either lateral direction stay attached for 71 frames.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        base = first_course(core)
        sample_motor(core, base, '0dd', 96, 256, False)
        sample_motor(core, base, '00f', 3280, 288, True)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
