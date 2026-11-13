"""Read E1 land motion in Yoshi's Island 1, using each SNES controller."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, first_course, read_word, write_word
from probe_player_contacts import measure_jump, put_tile
from probe_shell_contacts import position, spawn

RIGHT, LEFT, RUN = 128, 64, 2


def flat_course(core):
    first_course(core)
    ram = core.ram
    for col in range(64):
        for row in range(27):
            put_tile(ram, col, row, 0x130 if row == 24 else 0x25)
    for slot in range(12):
        ram[0x14c8 + slot] = 0
    write_word(ram, 0x94, 128)
    write_word(ram, 0x96, 352)
    core.run(20)
    return core.freeze()


def measure_distance(core, scene, seat, buttons, frames):
    core.restore(scene)
    ram = core.ram
    ram[0x0da0], ram[0x0db3] = 0x82, seat
    core.input_port = seat
    start = read_word(ram, 0x94)
    distances = {}
    for frame, pad in enumerate(buttons, 1):
        core.run(1, pad)
        if frame in frames:
            distances[frame] = read_word(ram, 0x94) - start
    return distances


def contact_in_flight(core, image, scene, seat, phase):
    core.restore(scene)
    ram = core.ram
    ram[0x19], ram[0x0db3] = 2, seat
    ram[0x0da0], core.input_port = 0x82, seat
    spawn(ram, image, 0, 0x13, 154)
    core.run(4)
    write_word(ram, 0x94, 128)
    write_word(ram, 0x96, 232)
    position(ram, 0, 132, 232)
    ram[0x7b], ram[0x7d], ram[0x72], ram[0x77] = 35, 8, 12, 0
    ram[0x1407] = phase
    for frame in range(1, 5):
        core.run(1, RIGHT | RUN)
        if ram[0x1497] or ram[0x71]:
            return frame, ram[0x19], ram[0x1407], ram[0x140d], ram[0x1497], ram[0x71]
    raise AssertionError('No Spiny contact within four PAL frames')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        scene = flat_course(core)
        for seat, player in enumerate(('Mario', 'Luigi')):
            for action, pads, frames in (
                ('walk, release at 55', [RIGHT] * 55 + [0] * 25, (20, 40, 55, 65, 75, 80)),
                ('run, reverse at 105', [RIGHT | RUN] * 105 + [LEFT | RUN] * 30,
                 (25, 40, 60, 80, 100, 105, 110, 115, 120, 135)),
            ):
                print(player, action, measure_distance(core, scene, seat, pads, frames))
            for phase in (0, 1, 4, 6):
                fields = contact_in_flight(core, image, scene, seat, phase)
                print(player, f'flight {phase}, contact/frame/form/glide/spin/iframes/animation', fields)
                assert fields[1:] == ((2, 0, 1, 48, 0) if phase else (0, 0, 0, 0, 1))
            for button, name in ((1, 'B'), (256, 'A')):
                for held in (1, 5, 10, 120):
                    core.restore(scene)
                    core.ram[0x0da0], core.ram[0x0db3] = 0x82, seat
                    height, landing, _ = measure_jump(core, button, held)
                    print(player, name, f'held {held}: rise {height}, land {landing}')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
