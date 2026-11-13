"""Probe Europe revision 1 ground, jump and mounted ducking with real pad input."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, read_word, write_word
from probe_shell_contacts import flat_room, spawn
from probe_player_contacts import put_tile

DOWN, RIGHT, JUMP = 1 << 5, 1 << 7, 1


def sample(core):
    r = core.ram
    return (r[0x73], r[0x13E0], r[0x187A], r[0x18DC], r[0x72],
            read_word(r, 0x94), read_word(r, 0x96))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        scene = flat_room(core)
        print('Tuple = duck, pose, riding, mountedPose, inAir, x, y')
        print('GetMarioClipping Y offsets, heights =', list(image[0x1B65C:0x1B664]))
        for form in range(4):
            core.restore(scene)
            r = core.ram
            r[0x19] = form
            core.run(12)
            print('form', form, 'standing', sample(core))
            for label, pad, frames in [('down', DOWN, 1), ('downRight', DOWN | RIGHT, 10),
                                       ('duckJump', DOWN | JUMP, 1), ('releaseInAir', 0, 6),
                                       ('land', 0, 100)]:
                core.run(frames, pad)
                print(label, sample(core))
        for label, pad in [('jump + Down from standing', DOWN | JUMP), ('spin + Down', DOWN | 256)]:
            core.restore(scene)
            r[0x19] = 2
            core.run(12)
            core.run(4, pad)
            print(label, sample(core))
        core.restore(scene)
        r[0x19] = 1
        for col in range(16):
            for row in range(12, 20):
                put_tile(r, col, row, 2)
        core.run(20)
        core.run(5, DOWN)
        print('Water, feet on floor, Down', sample(core), 'water', r[0x75])
        core.run(12, DOWN | RIGHT)
        print('Water, Down + Right', sample(core))
        core.run(4, DOWN | JUMP)
        print('Water, Down + swim', sample(core))
        core.run(4)
        print('Water, release', sample(core))
        core.restore(scene)
        r[0x19] = 1
        spawn(r, image, 0, 0x35, 64)
        core.run(4)
        r[0xC2] = 1  # Mounted Yoshi main-routine state.
        r[0x187A] = 1
        write_word(r, 0x94, 64)
        write_word(r, 0x96, 250)
        core.run(55)
        if r[0x187A]:
            print('Yoshi standing', sample(core))
            core.run(5, DOWN)
            print('Yoshi down', sample(core), 'Yoshi sprite pose', r[0x1602])
            core.run(1)
            print('Yoshi release', sample(core))
        else:
            raise RuntimeError('Mario did not mount the test Yoshi')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
