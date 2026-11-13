"""Measure turn-block impacts with real controller inputs in the PAL E1 player engine."""
import argparse
import json
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word
from probe_player_contacts import foreground_address, put_tile
from probe_shell_contacts import spawn

AIR, TURN, FLOOR = 0x25, 0x11e, 0x130
SPIN, JUMP, RUN = 256, 1, 2
ROWS = (16, 17, 18)


def get_tile(ram, col, row):
    offset = foreground_address(col, row)
    return ram[offset] + (ram[0x10000 + offset] << 8)


def scene(core, course):
    enter_room(core, course, '11a')
    ram = core.ram
    for slot in range(12):
        ram[0x14c8 + slot] = 0
    for col in range(16):
        for row in range(4, 23):
            put_tile(ram, col, row, FLOOR if row == 21 else AIR)
    return core.freeze()


def jump(core, saved, image, *, col_offset=0, stack=1, left=TURN, right=None,
         player=0, power=1, button=SPIN, held=12, water=False, carry=False):
    core.restore(saved)
    core.input_port = player
    ram = core.ram
    for row in ROWS[:stack]:
        put_tile(ram, 4, row, left)
    if right is not None:
        put_tile(ram, 5, ROWS[0], right)
    if water:
        for col in range(16):
            for row in range(5, 16):
                put_tile(ram, col, row, 2)
    write_word(ram, 0x94, 64 + col_offset)
    write_word(ram, 0x96, ROWS[0] * 16 - 32)
    ram[0x7d] = ram[0x7b] = 0
    ram[0x19], ram[0xdb3] = power, player
    core.run(8)
    if carry:
        spawn(ram, image, 8, 4, 64)
        core.run(2)
        ram[0x14c8 + 8] = 11
        core.run(4, RUN)
        assert ram[0x148f]
    score = 0xf34 + 3 * player
    watched = [(4, row) for row in ROWS[:stack]]
    if right is not None:
        watched.append((5, ROWS[0]))
    frames, impacts = [], []
    for age in range(110):
        before = [get_tile(ram, *cell) for cell in watched]
        core.run(1, (button if age < held else 0) | (RUN if carry else 0))
        speed = int.from_bytes(ram[0x7c:0x7e], 'little', signed=True)
        frames.append(dict(frame=age, footY=read_word(ram, 0x96) + 32, subY=ram[0x13dc],
                           speed=speed, spin=ram[0x140d], water=ram[0x75], carrying=ram[0x148f]))
        for cell, old in zip(watched, before):
            if old == TURN and get_tile(ram, *cell) == AIR:
                impacts.append(dict(frame=age, col=cell[0], row=cell[1],
                                    score=10 * int.from_bytes(ram[score:score + 3], 'little'),
                                    debris=sum(n == 1 for n in ram[0x17f0:0x17fc])))
    return dict(frames=frames, impacts=impacts, tiles=[get_tile(ram, *cell) for cell in watched])


def room_reload(core, course):
    enter_room(core, course, '11a')
    core.input_port = 0
    ram = core.ram
    col, row = 54, 14  # Actual turn block placed by the Vanilla Dome 1 object loader.
    assert get_tile(ram, col, row) == TURN
    for address, value in [(0x1a, 760), (0x1462, 760), (0x94, col * 16), (0x96, row * 16 - 32)]:
        write_word(ram, address, value)
    ram[0x7b] = ram[0x7d] = 0
    ram[0x19] = 1
    core.run(10)
    for frame in range(100):
        core.run(1, SPIN if frame < 12 else 0)
        if get_tile(ram, col, row) == AIR:
            break
    else:
        raise AssertionError('Placed Vanilla Dome 1 turn block stayed solid')
    enter_room(core, core.freeze(), '11a')
    assert get_tile(ram, col, row) == TURN
    print('Original block (54,14) in Vanilla Dome 1 shatters, then returns on native room reload.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    parser.add_argument('--trace', type=Path, help='save the complete stacked-block trajectories')
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        course = first_course(core)
        base = scene(core, course)
        traces = {}
        for player, power in ((0, 1), (1, 3)):
            for held in (12, 110):
                result = jump(core, base, image, stack=3, held=held, player=player, power=power)
                frames, impacts = result['frames'], result['impacts']
                assert [(hit['row'], hit['score']) for hit in impacts] == [(16, 50), (17, 100), (18, 150)]
                assert impacts[0]['debris'] == 4
                for hit in impacts:
                    assert frames[hit['frame']]['spin']
                label = f'player{player}-held{held}'
                traces[label] = result
                print(label, 'frame/footY/speed (1/4096 px per frame) at each shatter',
                      [(n, frames[n]['footY'], frames[n]['speed']) for n in (h['frame'] for h in impacts)])
                first, second = (h['frame'] for h in impacts[:2])
                print('footY until next impact:', [f['footY'] for f in frames[first:second + 1]])
        if args.trace:
            args.trace.write_text(json.dumps(traces, separators=(',', ':')) + '\n')
        seams = []
        for offset in range(16):
            result = jump(core, base, image, col_offset=offset, right=TURN)
            first = result['impacts'][0]
            seams.append(first['col'])
            assert first['col'] == (4 if offset < 8 else 5)
            assert len({h['frame'] for h in result['impacts']}) == len(result['impacts'])
        print('first column shattered for native X offsets 0..15:', seams)
        for offset, left, right, expected in [(7, FLOOR, TURN, []), (8, TURN, FLOOR, []),
                                              (7, TURN, FLOOR, [4]), (8, FLOOR, TURN, [5])]:
            res = jump(core, base, image, col_offset=offset, left=left, right=right)
            assert [hit['col'] for hit in res['impacts']] == expected
        for options in [dict(power=0), dict(button=JUMP), dict(left=0x124), dict(left=FLOOR),
                        dict(water=True), dict(carry=True)]:
            result = jump(core, base, image, **options)
            assert not result['impacts'] and result['tiles'] == [options.get('left', TURN)], options
            if options.get('carry') or options.get('water'):
                frames = result['frames'][:12]
                assert not any(f['spin'] for f in frames) and any(f['speed'] < 0 for f in frames)
                field = 'carrying' if options.get('carry') else 'water'
                assert all(f[field] for f in frames)
        print('Small, normal jump, ? block, solid floor, swimming and carrying shell checked.')
        room_reload(core, course)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
