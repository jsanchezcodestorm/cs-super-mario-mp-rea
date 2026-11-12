"""Sample flat-ground and slope controls on the unmodified PAL cartridge with Snes9x."""
import argparse
import json
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word


RIGHT, LEFT, DOWN, RUN, JUMP = 128, 64, 32, 2, 1


def sample(core):
    ram = core.ram
    return {
        'x': read_word(ram, 0x94), 'y': read_word(ram, 0x96),
        'vx': (read_word(ram, 0x7a) + 32768) % 65536 / 4096 - 8,
        'pMeter': ram[0x13e4], 'slidePose': ram[0x13ed], 'slopeType': ram[0x13e1],
        'grounded': bool(ram[0x77] & 4),
    }


def start(core, base, room, x, y):
    enter_room(core, base, room)
    core.run(4)
    # Set up an identical starting point on original terrain, then let the
    # cartridge resolve contact. After settling, the trace uses only joypad input.
    for address, value in [(0x94, x), (0x96, y), (0x7a, 0), (0x7c, 0)]:
        write_word(core.ram, address, value)
    core.run(110)
    if not sample(core)['grounded'] or sample(core)['vx'] != 0:
        raise ValueError(f'Invalid starting position in {room}')
    return core.freeze()


def trace(core, state, runs, samples):
    core.restore(state)
    out = {0: sample(core)}
    frame = 0
    for buttons, frames in runs:
        for _ in range(frames):
            core.run(1, buttons)
            frame += 1
            if frame in samples:
                out[frame] = sample(core)
    return out


def pipe_exit(core, base, room):
    enter_room(core, base, room)
    frames = {}
    for frame in range(41):
        if frame in (0, 14, 27, 28, 40):
            frames[frame] = {
                'x': read_word(core.ram, 0x94), 'y': read_word(core.ram, 0x96),
                'animation': core.ram[0x71], 'direction': core.ram[0x89],
                'pipeTimer': core.ram[0x88],
            }
        core.run()
    return frames


def capture(library, rom):
    core = Core(library, cartridge_image(rom))
    try:
        base = first_course(core)
        hall = start(core, base, '10d', 32, 332)
        mondo = start(core, base, '1e0', 180, 45)
        vanilla = start(core, base, '001', 789, 300)
        timings = [10, 20, 40, 60, 80]
        return {
            'pipeRight': pipe_exit(core, base, '1e3'),
            'pipeLeft': pipe_exit(core, base, '1f0'),
            'mondoSlide': trace(core, mondo, [(DOWN, 10), (0, 70)], timings),
            'mondoWalkDownhill': trace(core, mondo, [(RIGHT, 80)], timings),
            'vanillaSlide': trace(core, vanilla, [(DOWN, 40)], timings),
            'vanillaWalkUphill': trace(core, vanilla, [(RIGHT, 10)], [5, 10]),
            'vanillaWalkDownhill': trace(core, vanilla, [(LEFT, 10)], [5, 10]),
            'flatWalkBrake': trace(core, hall, [(RIGHT, 40), (0, 30)], [10, 20, 40, 50, 60, 70]),
            'flatRunReverse': trace(core, hall, [(RIGHT | RUN, 120), (LEFT | RUN, 30)], [20, 40, 60, 80, 100, 120, 125, 130, 140, 150]),
            'airNeutral': trace(core, hall, [(RIGHT, 20), (RIGHT | JUMP, 1), (JUMP, 15)], [20, 21, 26, 31, 36]),
        }
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    args.output.write_text(json.dumps(capture(args.core, args.rom), indent=2) + '\n')
