"""Measure PAL E1 platform paths, rider latches and real water buoys with Snes9x."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, write_word
from probe_shell_contacts import flat_room, position, spawn


def point(ram, slot):
    return ram[0xe4+slot] + 256*ram[0x14e0+slot], ram[0xd8+slot] + 256*ram[0x14d4+slot]


def measure(core, image, base, number, rider=False):
    core.restore(base)
    r = core.ram
    spawn(r, image, 0, number, 128)
    position(r, 0, 128, 272)
    for table in (0xaa, 0xb6, 0xc2, 0x151c, 0x1534, 0x1540, 0x1570, 0x1588, 0x14ec, 0x14f8):
        r[table] = 0
    track = []
    for frame in range(193):
        if number == 0x49:
            write_word(r, 0x94, 128)
        if rider and frame in (5, 6):
            x, y = point(r, 0)
            write_word(r, 0x94, x)
            write_word(r, 0x96, y-31)
            r[0x7d] = 16
        if rider and frame >= 7:
            write_word(r, 0x94, 40)
        r[0x1497] = 100
        core.run()
        track.append((*point(r, 0), r[0xaa], r[0x1540], r[0x1570], r[0x14c8]))
    return track


def water_room(core, base, room, number, ox, oy):
    enter_room(core, base, room)
    r, found, positions = core.ram, None, []
    for frame in range(1500):
        write_word(r, 0x94, min(ox-96, max(16, frame*4)))
        write_word(r, 0x96, oy-80)
        r[0x1497] = 250
        core.run()
        if r[0x71] == 9:
            r[0x71] = r[0x9d] = r[0x1496] = 0
        if found is None:
            found = next((s for s in range(12) if r[0x9e+s] == number and
                          r[0x14c8+s] and abs(point(r, s)[0]-ox) < 12), None)
        if found is not None:
            positions.append(point(r, found))
        if len(positions) == 257:
            break
    assert len(positions) == 257
    return tuple((min(v), max(v)) for v in zip(*positions))


def emitted_dolphin(core, base, camera_target, speed):
    """Follow a naturally emitted slot across water impact in Vanilla Secret 3."""
    enter_room(core, base, '002')
    r, previous = core.ram, {}
    for frame in range(1200):
        write_word(r, 0x94, min(camera_target, max(16, frame * 4)))
        write_word(r, 0x96, 250)
        r[0x1497] = 200
        core.run()
        if r[0x71] == 9:
            r[0x71] = r[0x9d] = r[0x1496] = 0
        for slot in range(12):
            if not (r[0x14c8+slot] == 8 and r[0x9e+slot] == 0x41 and r[0x151c+slot]):
                previous.pop(slot, None)
                continue
            x, y = point(r, slot)
            vx, vy = r[0xb6+slot], r[0xaa+slot]
            last = previous.get(slot)
            if last and abs(x-last[0]) <= 2 and vx == last[1] == speed & 255 and last[2] < 64 and vy == 192:
                print(f'Room 002 generated dolphin at ({x}, {y}): X speed {speed}/16, relaunched at -64/16')
                return
            previous[slot] = (x, vx, vy)
    raise AssertionError(f'No generated dolphin jumped out of water at X={camera_target}')


def verify(core, image):
    # E1 SpriteTweakerB and GetSpriteClippingA ($03:B56C / $03:B5A8).
    profile = image[0x3f335 + 0x5e] & 0x3f
    assert (profile, image[0x1b56c+profile], image[0x1b5a8+profile]) == (5, 0, 80)
    base = flat_room(core)
    for number, expected in {
        0x55: (97, 272), 0x57: (128, 241), 0xb7: (96, 304),
        0xb8: (96, 240), 0xbb: (64, 272), 0x49: (128, 245),
    }.items():
        measured = measure(core, image, base, number)
        assert measured[64][:2] == expected, (number, expected, measured[64])
        print(f'{number:02X} frame 64 {expected}; frame 128 {measured[128][:2]}')
    for number, expected in {0xc4: (128, 275), 0xc0: (128, 281), 0xba: (147, 272),
                             0x5e: (137, 272)}.items():
        measured = measure(core, image, base, number, rider=True)
        assert measured[24][:2] == expected, (number, expected, measured[24])
        if number == 0xc0:
            assert measured[68][5] == 0
        print(f'{number:02X} passenger contact frame 5; frame 24 {expected}; frame 64 {measured[64]}')
    for room, number, x, y in [('102', 0x5d, 256, 368), ('11c', 0x5b, 1152, 384),
                               ('002', 0x42, 288, 384), ('002', 0x43, 1696, 384)]:
        span_x, span_y = water_room(core, base, room, number, x, y)
        assert (span_x[0] == span_x[1]) == (number != 0x42)
        assert span_y[1]-span_y[0] > (95 if number < 0x44 else 4)
        print(f'Room {room} sprite {number:02X}, 257 native frames: X {span_x}, Y {span_y}')
    emitted_dolphin(core, base, 1000, -24)
    emitted_dolphin(core, base, 3056, 24)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    emulator = Core(args.core.resolve(), image)
    try:
        verify(emulator, image)
    finally:
        emulator.lib.retro_unload_game()
        emulator.lib.retro_deinit()
