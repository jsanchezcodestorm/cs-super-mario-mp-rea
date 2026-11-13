"""Compare PAL tape and Sunken Ghost Ship exits under real controller input."""
import argparse
from pathlib import Path

from course_clear import StatusPlane, field, word
from native_rooms import Core, cartridge_image, enter_room, read_word, write_word
from probe_shell_contacts import flat_room, spawn


def tape_contact(core, rom, flat, seat):
    core.restore(flat)
    r = core.ram
    r[0xdb3] = core.input_port = seat
    spawn(r, rom, 0, 0x7b, 100)
    core.run(10)
    write_word(r, 0x94, 99)
    write_word(r, 0x96, 288)
    core.run()
    assert r[0x1493] == 255 and r[0x1900] > 0
    return core.freeze()


def buttons(frame):
    # Alternate navigation, jump and run. A fresh button arrives every four frames.
    return (0, 128 | 1, 2 | 256 | 64, 16 | 32, 0)[(frame // 4) % 5]


def tape_walk(core, start, time, inputs, bonus):
    core.restore(start)
    r = core.ram
    r[0xf31:0xf34] = [time // 100, (time // 10) % 10, time % 10]
    if bonus:
        r[0xf48 + r[0xdb3]] = 99
    frames = []
    for age in range(600):
        if age:
            core.run(1, buttons(age) if inputs else 0)
        if r[0x100] != 20:
            assert (age, r[0x100]) == (531, 16 if bonus else 12)
            break
        frames.append((read_word(r, 0x94), read_word(r, 0x96), r[0x13e0], r[0x1433]))
    assert len(frames) == 531 and frames[358][2] == 38 and frames[468][3] == 236
    return frames


def ship_contact(core, flat):
    enter_room(core, flat, '0f7')
    core.run(100)  # Finish the entrance pipe before positioning the observer.
    r = core.ram
    for y in range(5680, 6220, 2):
        r[0x1497] = 60
        for address, value in ((0x1a, 224), (0x1c, y - 128), (0x1462, 224),
                               (0x1464, y - 128), (0x94, 351), (0x96, y)):
            write_word(r, address, value)
        core.run()
        if r[0x1493]:
            assert r[0x1493] == 255 and r[0x5b] & 1
            assert any(r[0x9e + i] == 0x4a and not r[0x14c8 + i] for i in range(12))
            return
    raise AssertionError("Native orb in Sunken Ghost Ship did not activate")


def ship_finish(core, flat):
    ship_contact(core, flat)
    r = core.ram
    origin = (read_word(r, 0x94), read_word(r, 0x96))
    r[0xf31:0xf34] = [2, 9, 9]
    first = {}
    for age in range(383):
        if age:
            core.run(1, buttons(age))
        assert r[0x100] == (20 if age < 352 else 11 if age < 382 else 12)
        assert r[0xdae] == min(15, (383 - age) // 2)
        if age >= 352:
            continue
        assert (read_word(r, 0x94), read_word(r, 0x96)) == origin
        assert r[0x1433] == 0 and r[0x13e0] not in (20, 38)
        plane = StatusPlane(core)
        if word(plane, 9, 10) & 1023 != 12:
            continue
        first.setdefault('panel', age)
        remaining = field(plane, 17, 13, 5)
        if remaining < 14950:
            first.setdefault('count', age)
        if remaining == 0:
            first.setdefault('zero', age)
    assert first == {'panel': 2, 'count': 84, 'zero': 237}, first
    print('Sunken Ghost Ship: native $4A, steady player,', first,
          'fade mode 352, first dim pixel level 354, load map at 382')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    rom = cartridge_image(args.rom)
    core = Core(args.core.resolve(), rom)
    try:
        flat = flat_room(core)
        for seat in (0, 1):
            start = tape_contact(core, rom, flat, seat)
            reference = tape_walk(core, start, 299, False, False)
            for time, bonus in ((0, False), (299, False), (999, False), (299, True)):
                assert tape_walk(core, start, time, True, bonus) == reference
            print('Controller', seat+1, '531 equal walk/pose/iris frames across timer, pad inputs and bonus')
        ship_finish(core, flat)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
