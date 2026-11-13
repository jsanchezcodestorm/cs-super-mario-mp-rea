"""Measure E1 grip on a Map16 vine in a controlled single-column layout."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course
from probe_fence_grip import A, B, DOWN, LEFT, RIGHT, UP, place, position
from probe_player_contacts import put_tile


def one_column(core):
    enter_room(core, first_course(core), '101')
    core.run(24)
    for col in range(3, 12):
        for row in range(10, 22):
            put_tile(core.ram, col, row, 6 if col == 8 and 14 <= row <= 20 else 0x25)
    return core.freeze()


def walk_off(core, scene, form, key, expected_frame, expected_xy):
    place(core, scene, 128, 260, form)
    core.run(2, UP)
    for frame in range(1, expected_frame + 1):
        core.run(1, key)
        assert bool(core.ram[0x74]) == (frame < expected_frame)
    assert position(core.ram) == expected_xy
    print('form', form, 'input', key, 'releases on frame', frame, 'at', expected_xy)


def measure(core, scene, form):
    ram = core.ram
    for x, key, grip in ((119, UP, 0), (120, UP, 31), (135, UP, 31), (136, UP, 0),
                         (128, DOWN, 31), (128, RIGHT, 0)):
        place(core, scene, x, 260, form)
        core.run(1, key)
        assert ram[0x74] == grip
    place(core, scene, 128, 260, form)
    core.run(1, UP)
    core.run(40)
    assert position(ram) == (128, 258) and ram[0x74] == 31
    core.run(1, A)
    assert ram[0x74] == 31
    core.run(1, B)
    assert not ram[0x74] and ram[0x7d] == 0xb0
    print('form', form, 'middle acquisition at X 120..135, idle holds, A holds, B jumps')

    place(core, scene, 128, 260, form)
    core.run(2, UP)
    core.run(20, RIGHT | UP)
    assert position(ram) == (128, 235), position(ram)
    core.run(80, UP)
    assert position(ram) == (128, 214 if form else 207) and ram[0x74]
    print('form', form, 'vertical input overrides sideways on vine, top holds at', position(ram))
    walk_off(core, scene, form, RIGHT, 15, (142, 257))
    walk_off(core, scene, form, LEFT, 16, (113, 257))
    walk_off(core, scene, form, DOWN, 54 if form else 48, (128, 318 if form else 312))
    walk_off(core, scene, form, RIGHT | UP, 52 if form else 58, (142, 214 if form else 207))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    machine = Core(args.core, cartridge_image(args.rom))
    try:
        scene = one_column(machine)
        for powerup in (0, 1):
            measure(machine, scene, powerup)
    finally:
        machine.lib.retro_unload_game()
        machine.lib.retro_deinit()
