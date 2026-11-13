"""Read PAL Mario and Luigi poses, facing, walking timer and cape frame under pad input."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room
from probe_player_contacts import put_tile
from probe_shell_contacts import flat_room

RIGHT, LEFT, UP, JUMP, SPIN, RUN = 128, 64, 16, 1, 256, 2


def trace(core, title, pads):
    r = core.ram
    poses = []
    samples = []
    for buttons in pads:
        core.run(1, buttons)
        sample = (r[0x13e0], r[0x76], r[0x13df], r[0x13db], r[0x1496], r[0x7b], r[0x72], r[0x74], r[0x75])
        samples.append(sample)
        if not poses or poses[-1] != sample[0]:
            poses.append(sample[0])
    print(title, 'poses', poses, 'cape', sorted({s[2] for s in samples}), 'final', samples[-1])
    return samples


def pipes(core, base):
    ram = core.ram
    for mounted in (False, True):
        core.restore(base)
        ram[0xdc1] = ram[0x187a] = int(mounted)
        start = core.freeze()
        for room, facing in [('0bd', 1), ('1f0', 0), ('0c6', 1), ('1c9', 1)]:
            enter_room(core, start, room)
            horizontal = room in ('0bd', '1f0')
            slot = next((i for i in range(12) if ram[0x9e+i] == 0x35 and ram[0x14c8+i]), 0)
            poses, mount = set(), set()
            for _ in range(60):
                if not ram[0x71]:
                    break
                assert ram[0x76] == facing
                poses.add(ram[0x13e0])
                if mounted:
                    mount.add(ram[0x1602+slot])
                    assert ram[0x1419] == (1 if horizontal else 2)
                core.run()
            assert poses == (({41} if horizontal else {33}) if mounted else ({0, 1} if horizontal else {15}))
            if mounted:
                assert mount == ({8, 9} if horizontal else {0})
            print(room, 'mounted', mounted, 'poses', sorted(poses), 'Yoshi', sorted(mount), 'facing', facing)


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('core', type=Path)
    args.add_argument('rom', type=Path)
    options = args.parse_args()
    image = cartridge_image(options.rom)
    core = Core(options.core.resolve(), image)
    try:
        scene = flat_room(core)
        for player in range(2):
            core.input_port = player
            for form in range(4):
                name = ('Mario', 'Luigi')[player] + '/' + ('small', 'super', 'cape', 'fire')[form]
                core.restore(scene)
                r = core.ram
                r[0xdb3], r[0x19] = player, form
                core.run(8)
                idle = core.freeze()
                assert {r[0] for r in trace(core, name + ' look up', [UP] * 8)} == {3}
                walk = trace(core, name + ' walk', [RIGHT] * 42)
                assert {s[0] for s in walk} == ({0, 1, 2} if form else {0, 1})
                trace(core, name + ' sprint', [RIGHT | RUN] * 85)
                sprint = core.freeze()
                trace(core, name + ' running jump', [RIGHT | RUN | JUMP] * 28 + [RUN] * 18)
                core.restore(sprint)
                trace(core, name + ' brake', [LEFT] * 6)
                core.restore(idle)
                jump = trace(core, name + ' regular jump', [JUMP] * 20 + [0] * 34)
                assert {s[0] for s in jump} == {11, 36, 0}
                core.restore(idle)
                spin = trace(core, name + ' spin', [SPIN] * 16)
                assert {(s[0], s[1]) for s in spin} == {(0, 0), (0, 1), (68 if form else 37, 0), (69 if form else 15, 1)}
                core.restore(idle)
                for col in range(16):
                    for row in range(12, 20):
                        put_tile(r, col, row, 2)
                core.run(12)
                trace(core, name + ' swim', [JUMP] * 5 + [0] * 32)
                core.restore(idle)
                for col in range(10):
                    for row in range(12, 20):
                        put_tile(r, col, row, 6)
                trace(core, name + ' climb', [UP] * 32)
        print('Walking phases', list(image[0x5c68:0x5c6c]), 'PAL holds', list(image[0x5c6c:0x5c74]))
        core.input_port = 0
        pipes(core, scene)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
