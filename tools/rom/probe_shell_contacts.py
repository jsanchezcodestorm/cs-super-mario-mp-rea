"""Exercise shell/sprite collisions on the Europe revision 1 ROM in Snes9x."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, first_course, write_word
from probe_player_contacts import put_tile


# Bank 07 LoadTweakerBytes: WRAM destination and source offset in headerless E1.
TWEAKERS = ((0x1656, 0x3F26C), (0x1662, 0x3F335), (0x166E, 0x3F3FE),
            (0x167A, 0x3F4C7), (0x1686, 0x3F590), (0x190F, 0x3F659))
STATUS = 0x14C8
CHAIN = 0x1626
POPUP = 0x16E1
TIMER = 0x16FF
LIVES = 0x0DBE
SCORE = 0x0F34


def position(ram, slot, x, y=304):
    for low, high, value in ((0xE4, 0x14E0, x), (0xD8, 0x14D4, y)):
        ram[low + slot] = value & 255
        ram[high + slot] = value >> 8


def spawn(ram, image, slot, number, x):
    # Status 01 dispatches the sprite's INIT routine after the level loader
    # has placed it and copied its six ROM property bytes into the slot.
    ram[0x9E + slot] = number
    ram[STATUS + slot] = 1
    position(ram, slot, x)
    for table, offset in TWEAKERS:
        ram[table + slot] = image[offset + number]


def flat_room(core):
    first_course(core)
    ram = core.ram
    for col in range(32):
        for row in range(10, 23):
            put_tile(ram, col, row, 0x130 if row == 20 else 0x25)
    for slot in range(12):
        ram[STATUS + slot] = 0
    write_word(ram, 0x94, 32)
    write_word(ram, 0x96, 288)
    for slot in range(6):
        ram[POPUP + slot] = 0
    return core.freeze()


def new_popups(ram):
    return [ram[POPUP + slot] for slot in range(6)
            if ram[POPUP + slot] and ram[TIMER + slot] == 47]


def pair(core, image, scene, number, status, direction, kicker, target):
    core.restore(scene)
    ram = core.ram
    spawn(ram, image, kicker, 4, 100)
    spawn(ram, image, target, number, 172)
    core.run(3)
    for slot in (kicker, target):
        ram[0x1588 + slot] = 4  # On the flat floor.
        ram[0xAA + slot] = 0
    ram[STATUS + kicker] = 10
    ram[STATUS + target] = status
    position(ram, kicker, 140)
    position(ram, target, 140 + direction * 8)
    ram[0xB6 + kicker] = direction * 55 & 255
    ram[0xB6 + target] = -direction * 55 & 255 if status == 10 else 0
    ram[0x157C + kicker] = int(direction < 0)
    ram[0x157C + target] = int(direction > 0)
    for _ in range(6):
        core.run()
        popups = new_popups(ram)
        if popups:
            break
    return ram[STATUS + kicker], ram[STATUS + target], ram[CHAIN + kicker], popups


def measured_line(core, image, scene):
    core.restore(scene)
    ram = core.ram
    shell = 10
    spawn(ram, image, shell, 4, 58)
    for slot in range(10):
        spawn(ram, image, slot, 5, 64 + 18 * slot)
    core.run(2)
    position(ram, shell, 55)
    ram[STATUS + shell] = 10
    ram[0xB6 + shell] = 55
    for slot in range(10):
        position(ram, slot, 64 + 18 * slot)
        ram[0x157C + slot] = 1
    initial_lives = ram[LIVES]
    initial_score = int.from_bytes(ram[SCORE:SCORE + 3], 'little')
    popups = []
    for _ in range(165):
        core.run()
        popups.extend(new_popups(ram))
    score = (int.from_bytes(ram[SCORE:SCORE + 3], 'little') - initial_score) * 10
    result = popups, score, ram[LIVES] - initial_lives
    expected = ([6, 7, 8, 9, 10, 11, 12, 13, 13, 13], 16400, 3)
    if result != expected:
        raise ValueError(f'Ten red Koopas: {result}, expected {expected}')
    print(f'Ten red Koopas: {score} points, {result[2]} extra lives, score sprites {popups}')


def measure_launch(core, image, scene):
    ram = core.ram
    shell = 6
    for start_status, expected in ((9, 200), (11, 0)):
        core.restore(scene)
        spawn(ram, image, shell, 4, 100)
        core.run(3)
        position(ram, shell, 55)
        ram[STATUS + shell] = start_status
        ram[0x1588 + shell] = 4
        write_word(ram, 0x94, 48)
        write_word(ram, 0x96, 288)
        core.run(16)
        score = int.from_bytes(ram[SCORE:SCORE+3], 'little') * 10
        assert (ram[STATUS + shell], ram[CHAIN + shell], score) == (10, 0, expected)
        print(f'Launch from status {start_status}: {score} points, shell streak still zero.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        scene = flat_room(core)
        measure_launch(core, image, scene)
        measured_line(core, image, scene)
        for number, status, expected in [
            (5, 8, (10, 2, 1, [6])), (5, 9, (10, 2, 1, [6])), (5, 10, (2, 2, 0, [9])),
            (0x80, 9, (10, 9, 0, [])), (0x3E, 9, (10, 9, 0, [])), (0x74, 8, (10, 8, 0, [])),
            (0x21, 8, (10, 8, 0, [])), (0x28, 8, (10, 8, 0, [])), (0xAB, 8, (10, 2, 1, [6])),
        ]:
            for direction in (-1, 1):
                for kicker, target in ((6, 4), (4, 6)):
                    actual = pair(core, image, scene, number, status, direction, kicker, target)
                    if actual != expected:
                        raise ValueError(f'Sprite {number:02X}, status {status}, direction {direction}, '
                                         f'slots {kicker}/{target}: {actual}, expected {expected}')
            print(f'Sprite {number:02X}, status {status}: {expected}, both directions and slot orders')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
