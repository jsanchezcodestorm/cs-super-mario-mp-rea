"""Measure the PAL E1 player's fence contact bits and positions in Iggy's Castle."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word

UP, DOWN, LEFT, RIGHT = 16, 32, 64, 128
B, A = 1, 256


def position(ram):
    return read_word(ram, 0x94), read_word(ram, 0x96)


def place(core, entrance, x, y, form):
    # Place the character before first contact. All later changes to position
    # and the climbing flag come from normal controller input in the cartridge.
    core.restore(entrance)
    ram = core.ram
    ram[0x19] = form
    write_word(ram, 0x94, x)
    write_word(ram, 0x96, y)
    for address in (0x7b, 0x7d, 0x13da, 0x13dc):
        ram[address] = 0
    ram[0x1497] = 250  # Isolate terrain from the fence Koopas in this room.


def traverse(core, entrance, form):
    ram = core.ram
    place(core, entrance, 120, 260, form)
    core.run(2, UP)
    core.run(75, RIGHT)
    core.run(1)
    stopped = position(ram)
    assert stopped == (195, 257)
    for _ in range(40):
        core.run()
        assert position(ram) == stopped and ram[0x74] == 0x9f
    core.run(30, LEFT)
    core.run(1)
    assert position(ram) == (165, 257) and ram[0x74] == 0x9f
    core.run(1, A)
    assert ram[0x74] == 0x9f and ram[0x140d] == 0
    core.run(1)
    core.run(1, B)
    assert ram[0x74] == 0 and ram[0x7d] == 0xb0
    print('form', form, 'horizontal 75 right, 40 idle, 30 left: y=257; A holds, B releases')


def jump_from_rest(core, entrance, seat):
    place(core, entrance, 120, 260, 0)
    ram = core.ram
    ram[0xda0], ram[0xdb3] = 0x82, seat
    core.input_port = seat
    core.run(3, UP)
    core.run(6)
    _, y = position(ram)
    heights = []
    for _ in range(11):
        core.run(1, B)
        heights.append(position(ram)[1] - y)
    assert heights == [0, -6, -11, -17, -22, -26, -31, -35, -39, -43, -47]
    print(('Mario', 'Luigi')[seat], 'B from stationary fence, Y displacements', heights)


def edges(core, entrance, form):
    ram = core.ram
    for x, keys, n, expected_x, expected_y, mask in (
        (460, RIGHT, 75, 498, 257, 0x87),
        (555, LEFT, 75, 541, 257, 0x87),
        (460, UP | RIGHT, 80, 498, 214 if form else 207, 0x85),
    ):
        place(core, entrance, x, 260, form)
        core.run(2, UP)
        core.run(n, keys)
        assert position(ram) == (expected_x, expected_y) and ram[0x74] == mask
        core.run(20)
        assert position(ram) == (expected_x, expected_y) and ram[0x74] == mask
        print('form', form, 'direction', keys, 'stopped at', position(ram), 'grip', hex(mask))
    place(core, entrance, 120, 260, form)
    core.run(2, UP)
    for frame in range(1, 100):
        core.run(1, DOWN)
        if ram[0x74] == 0:
            break
    assert (frame, position(ram)) == ((54, (120, 318)) if form else (48, (120, 312)))
    print('form', form, 'down releases at', position(ram), 'after', frame, 'frames')


def first_contact(core, entrance):
    ram = core.ram
    for x, y, key, contacts, grip in (
        (120, 260, RIGHT, 0x9f, 0),
        (120, 260, UP, 0x9f, 0x9f),
        (499, 260, UP, 0x87, 0),
        (120, 310, UP, 0x8b, 0),
    ):
        place(core, entrance, x, y, 0)
        core.run(1, key)
        assert (ram[0x8b], ram[0x74]) == (contacts, grip)
    print('grabs with Up on full contact; side-only input and partial contact do not initiate grip')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    machine = Core(args.core, cartridge_image(args.rom))
    try:
        enter_room(machine, first_course(machine), '101')
        machine.run(24)
        entrance = machine.freeze()
        first_contact(machine, entrance)
        for powerup in (0, 1):
            traverse(machine, entrance, powerup)
            edges(machine, entrance, powerup)
        for seat in range(2):
            jump_from_rest(machine, entrance, seat)
    finally:
        machine.lib.retro_unload_game()
        machine.lib.retro_deinit()
