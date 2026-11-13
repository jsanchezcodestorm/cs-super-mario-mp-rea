"""Exercise Yoshi's tongue and measure individual native rewards in the E1 cartridge."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, write_word
from probe_player_contacts import foreground_address, put_tile
from probe_shell_contacts import flat_room, position, spawn, STATUS

Y, X, RIGHT = 2, 512, 128
TARGET = 8


def sprite_xy(ram, slot):
    return (ram[0xE4 + slot] + 256 * ram[0x14E0 + slot],
            ram[0xD8 + slot] + 256 * ram[0x14D4 + slot])


def mounted(core, image):
    flat_room(core)
    ram = core.ram
    ram[0x19] = 1
    spawn(ram, image, 0, 0x35, 64)
    core.run(4)
    ram[0xC2] = ram[0x187A] = 1
    write_word(ram, 0x94, 64)
    write_word(ram, 0x96, 250)
    core.run(55)
    core.run(4, RIGHT)
    core.run(15)
    assert ram[0x187A] and ram[0x157C] == 0
    return core.freeze()


def score(ram, seat):
    start = 0xF34 + seat * 3
    return 10 * int.from_bytes(ram[start:start + 3], 'little')


def empty_attack(core, scene, seat, button):
    core.restore(scene)
    ram = core.ram
    ram[0xDA0] = 0  # Both native turns use the first physical pad.
    ram[0xDB3] = seat
    lengths, visible = [], []
    for frame in range(1, 61):
        core.run(1, button)  # Keep holding, to detect accidental repeat.
        lengths.append(ram[0x151C])
        if ram[0x20D] < 224:
            visible.append(frame)
            assert tuple(ram[0x202 + 4*i] for i in range(3, 8)) == (0x76,) * 4 + (0x66,)
    expected = [0] * 8 + list(range(3, 33, 3)) + [33] * 8 + list(range(29, 0, -4))
    assert lengths == expected + [0] * (len(lengths) - len(expected))
    assert visible == list(range(9, 36)), visible


def feed(core, image, scene, seat, number):
    core.restore(scene)
    r = core.ram
    r[0xDA0], r[0xDB3] = 0, seat
    x, y = sprite_xy(r, 0)
    spawn(r, image, TARGET, number, x + 34)
    core.run()
    position(r, TARGET, x + 34, y)
    r[0x157C + TARGET] = 1
    if number == 0x80:
        r[STATUS + TARGET] = 9
    baseline = r[0xDBE]
    held = number in (5, 0x80)
    grabbed = parked = None
    for frame in range(1, 1121 if held else 170):
        core.run(1, Y if frame == 1 else 0)
        if grabbed is None and r[0x160E] == TARGET:
            grabbed = frame
        if parked is None and r[STATUS + TARGET] == 7:
            parked = frame
            assert r[0x18AC] == 255 and r[0xDBF] == 0
    assert score(r, 1 - seat) == 0
    result = r[0xDBF], score(r, seat), r[0xDBE] - baseline, r[0x19]
    assert (grabbed is None) == (number == 0x28)
    assert (parked is not None) == held
    return result


def timer(r):
    return sum(a * b for a, b in zip(r[0xF31:0xF34], (100, 10, 1)))


def berry(core, scene, tile, passive):
    core.restore(scene)
    r = core.ram
    x, y = sprite_xy(r, 0)
    col, row = ((x + 20) // 16, (y + 8) // 16) if passive else ((x + 40) // 16, (y + 21) // 16)
    address = foreground_address(col, row)
    put_tile(r, col, row, tile)
    r[0x18D4], r[0x18D5] = 9, 1
    start_timer, eaten = None, None
    for frame in range(1, 100):
        core.run(1, Y if frame == 1 and not passive else 0)
        if r[0x18D6] and start_timer is None:
            start_timer = timer(r)
        if start_timer is not None and eaten is None and r[0x18D6] == 0:
            eaten = frame
            assert timer(r) - start_timer == (20 if tile == 0x47 else 0)
    assert eaten is not None
    assert (r[address], r[address + 0x10000], r[0xDBF], score(r, 0)) == (0x49, 0, 1, 0)
    assert (r[0x18D4], r[0x18D5], r[0x18DA]) == {
        0x45: (0, 1, 0x74), 0x46: (9, 0, 0x6A), 0x47: (9, 1, 0),
    }[tile]
    return eaten


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        scene = mounted(core, image)
        for seat in range(2):
            for button in (Y, X):
                empty_attack(core, scene, seat, button)
            for number, expected in {
                0x0F: (1, 0, 0, 1), 0x21: (1, 200, 0, 1), 0x74: (0, 1000, 0, 1),
                0x75: (0, 1000, 0, 3), 0x76: (0, 1000, 0, 1), 0x77: (0, 1000, 0, 2),
                0x78: (0, 0, 1, 1), 0x28: (0, 0, 0, 1), 5: (1, 0, 0, 1), 0x80: (1, 0, 0, 1),
            }.items():
                value = feed(core, image, scene, seat, number)
                assert value == expected, (seat, hex(number), value, expected)
                print(f'PAD {seat+1}, sprite {number:02X}: coins, score, extra lives, form = {value}')
        for tile in range(0x45, 0x48):
            for passive in (False, True):
                frame = berry(core, scene, tile, passive)
                print(f'Berry {tile:02X}, {"head" if passive else "tongue"}: swallowed frame {frame}; 1 coin, 0 points')
        print('Held Y and X each launched once; five visible OBJ tiles on frames 9..35, max length 33.')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
