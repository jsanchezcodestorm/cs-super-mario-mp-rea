"""Measure the PAL phase masks, Map16 changes and rewards in three-question rooms."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, write_word
from probe_player_contacts import foreground_address


def bottom_row(ram):
    values = []
    for col in (4, 7, 10):
        address = foreground_address(col, 21)
        values.append(ram[address] + 256 * ram[0x10000 + address])
    return values


def hit(core, col, phase):
    # Place small Mario's head below the block and run at one of the four
    # frame-counter phases. Subsequent settling and rewards run uninterrupted.
    ram = core.ram
    write_word(ram, 0x94, col * 16)
    write_word(ram, 0x96, 21 * 16)
    ram[0x7B] = 0
    ram[0x7D] = 0xC0
    ram[0x72] = 1
    ram[0x13] = (phase - 1) & 255
    core.run(20)
    return bottom_row(ram)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        enter_room(core, first_course(core), '0bd')
        core.run(90)
        base = core.freeze()
        used, correct, question = 0x132, 0x15E, 0x124
        for phase in range(4):
            core.restore(base)
            result = hit(core, 4, phase)
            assert result == ([correct, question, question] if phase else [used] * 3)
            core.restore(base)
            hit(core, 4, 1)
            result = hit(core, 7, phase)
            assert result == ([correct, correct, question] if phase & 1 else [correct, used, used])
            core.restore(base)
            hit(core, 4, 1)
            hit(core, 7, 1)
            assert hit(core, 10, phase) == [correct] * 3
            ram = core.ram
            assert ram[0x0DBF] == 2
            assert sum(ram[0x9E+i] == 0x78 and ram[0x14C8+i] == 8 for i in range(12)) == 1
        print('0BD: all four PAL phases tested on all three hits; two coins, three O tiles and one 1-Up mushroom.')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
