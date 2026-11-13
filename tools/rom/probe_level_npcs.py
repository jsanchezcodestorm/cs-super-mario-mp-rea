"""Read PAL E1 sprite state transitions and verify the bird slots in Yoshi's House."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, write_word
from probe_shell_contacts import flat_room, position, spawn


def states(core, rom, base, number):
    core.restore(base)
    ram = core.ram
    spawn(ram, rom, 0, number, 120)
    position(ram, 0, 120, 232 if number == 0x8a else 260)
    transitions, poses, directions = [], set(), set()
    for frame in range(370):
        ram[0x1497] = 100
        write_word(ram, 0x94, 32 if frame < 180 else 180)
        ram[0x76] = int((frame // 70) % 2 == 0)
        core.run()
        if ram[0x9e] != number or ram[0x14c8] != 8:
            break
        phase = ram[0xc2]
        if not transitions or transitions[-1][1] != phase:
            transitions.append((frame, phase, ram[0x1540]))
        poses.add(ram[0x1602])
        directions.add(ram[0x157c])
    print(f'{number:02X}: phases {transitions}, poses {sorted(poses)}, facing {sorted(directions)}')
    return transitions


def verify(core, rom):
    base = flat_room(core)
    tracks = {number: states(core, rom, base, number)
              for number in (0x4b, 0x8a, 0x90, 0x9d, 0xa8, 0xae, 0x28, 0x37, 0xaf, 0xb0)}
    assert tracks[0x4b] == [(0,0,0),(1,1,144),(145,2,12),(157,3,128),(285,4,32),(317,0,80)]
    assert tracks[0xa8][:6] == [(0,0,0),(1,1,0),(25,2,80),(105,3,10),(115,4,32),(207,0,64)]
    enter_room(core, base, '104')
    ram = core.ram
    placed = sorted((ram[0xe4+s], s) for s in range(12) if ram[0x9e+s] == 0x8a and ram[0x14c8+s])
    assert placed == [(64,9),(80,8),(96,7),(112,6)]
    print('Native bird positions and palette slots:', placed)


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
