"""Trace an actual fence punch, turn, return turn and gray platform OAM in PAL E1."""
import sys
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word
from probe_shell_contacts import flat_room, spawn


def punch(core, behind):
    r = core.ram
    samples = []
    for f in range(44):
        core.run(1, 2 if f == 0 else 0)  # New press of Y while clinging.
        slots = [i for i in range(12) if r[0x9e+i] == 0x54 and r[0x14c8+i] == 8 and r[0x1540+i]]
        samples.append((r[0x149e], r[0x149d], r[0x13f9], r[0x13e0], read_word(r, 0x94)))
        if slots:
            assert r[0x15ea+slots[0]] == 0x30
            assert r[0x201 + 4*76] < 224
    assert [v[0] for v in samples[:9]] == list(range(8,-1,-1))
    assert [v[1] for v in samples[12:]] == list(range(31,-1,-1))
    assert all(v[2] == behind for v in samples[:27])
    assert all(v[2] == 1-behind for v in samples[27:])
    assert samples[1][3] == (35 if behind else 30)
    print('1D3 fence, start side', behind, 'P0/P1/P7/P12/P27/P42/P43',
          [samples[i] for i in (0,1,7,12,27,42,43)])


def platform(core, image):
    flat_room(core)
    r = core.ram
    spawn(r, image, 0, 0xa3, 120)
    core.run()
    r[0x1602] = r[0x151c] = 0
    r[0x9d] = 1
    core.run()
    first = 64 + r[0x15ea] // 4
    parts = [tuple(r[0x200+4*i:0x204+4*i]) for i in range(first,first+6)]
    assert [p[2] for p in parts] == [0x62, 0x61, 0x60, 0xa2, 0xa2, 0xa2]
    assert all(p[3] == 0x33 for p in parts)
    assert parts[4][1] == parts[3][1]-16 and parts[5][1] == parts[4][1]-16
    print('gray rotating platform, six native slots', parts)


if __name__ == '__main__':
    core_file, rom_file = map(Path, sys.argv[1:])
    image = cartridge_image(rom_file)
    core = Core(core_file, image)
    try:
        platform(core, image)
        # Boot again before taking the shared first-course state.
        core.lib.retro_reset()
        base = first_course(core)
        enter_room(core, base, '1d3')
        core.run(24)
        write_word(core.ram, 0x94, 194)
        write_word(core.ram, 0x96, 288)
        core.run(6,16)
        punch(core, 0)
        core.run(3)
        punch(core, 1)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
