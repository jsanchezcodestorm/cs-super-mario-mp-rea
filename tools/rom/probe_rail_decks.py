"""Trace PAL line-guided decks and rope motors using Snes9x and their native room loader."""
import argparse
import hashlib
import json
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word
from probe_pipe_plants import position_observer, sprite_position


def trace(core, base, room, sprite, x, y, player_offset, steps):
    enter_room(core, base, room)
    core.run(30)
    ram = core.ram
    for px in range(read_word(ram, 0x94), max(96, x - 70), 3):
        position_observer(core, px, y - 48)
    slot = next(i for i in range(12) if ram[0x14c8+i] == 8 and ram[0x9e+i] == sprite
                and abs(sprite_position(ram, i)[0] - x) < 8)
    pin = sprite_position(ram, slot)
    assert ram[0x1626+slot] == 1
    core.run(8)
    assert sprite_position(ram, slot) == pin
    write_word(ram, 0x94, x - 8)
    write_word(ram, 0x96, y + player_offset)
    ram[0x1497] = 200
    ram[0x7b] = ram[0x7d] = 0
    for _ in range(6):
        core.run(1, 16 if sprite == 0x64 else 0)
        if not ram[0x1626+slot]:
            break
    assert not ram[0x1626+slot], (room, pin, player_offset)
    held = core.freeze()
    samples = []
    for _ in range(steps):
        assert ram[0x14c8+slot] == 8 and (not ram[0x9d])
        samples.append(sprite_position(ram, slot))
        ram[0x1497] = 255
        core.run()
    print(f'{room} ${sprite:02X} ({x},{y}) slot {slot} clip {ram[0x1662+slot]&63}: '
          f'{len(set(samples))} distinct pins in {steps} PAL frames; {samples[0]} -> {samples[-1]}')
    if sprite == 0x64:
        core.restore(held)
        core.run(6)
        assert ram[0x18be] == 8
        before = read_word(ram, 0x96)
        core.run(3, 1)  # B: let go of the rope.
        assert ram[0x18be] == 0 and read_word(ram, 0x96) < before
    return samples



def curved_track(core, base):
    enter_room(core, base, '005')
    core.run(30)
    r = core.ram
    for px in range(read_word(r,0x94), 610, 2):
        position_observer(core,px,264)
        slot = next((i for i in range(12) if r[0x14c8+i] == 1 and r[0x9e+i] == 0x62), None)
        if slot is not None:
            break
    assert slot is not None
    core.run(3)  # initial spawn, track selector, then first actual track sample
    points = []
    for _ in range(500):
        assert r[0x14c8+slot] == 8 and not r[0x9d]
        x,y = sprite_position(r, slot)
        points.append([x,y])
        position_observer(core, x-45, y-48)
    digest = hashlib.sha256(json.dumps(points, separators=(',',':')).encode()).hexdigest()
    assert digest == '58dea7528cb3d9924855cb2e602cc038df87b8750369116f2f6f4ebd387e1a76'
    print(f'005 autonomous brown deck: 500 PAL positions across curved and reverse track pieces; {digest}.')
    return points

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    parser.add_argument('--trace', type=Path)
    args = parser.parse_args()
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        base = first_course(core)
        cases = [('00f', 0x63, 304, 384, -39, 150),
                 ('0dd', 0x64, 96, 256, 30, 70), ('00f', 0x64, 3280, 288, 112, 14)]
        results = [dict(room=room, sprite=id_, x=x, y=y, pins=trace(core,base,room,id_,x,y,dy,n))
                   for room,id_,x,y,dy,n in cases]
        results.append(dict(room='005', sprite=0x62, x=624, y=304, pins=curved_track(core,base)))
        if args.trace:
            args.trace.write_text(json.dumps(results))
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
