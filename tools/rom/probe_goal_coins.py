"""Verify end-of-level status 06, simultaneous score-slot recycling and the actual Chuck in 105."""
import sys
from pathlib import Path
from native_rooms import Core, cartridge_image, enter_room, first_course, write_word
from probe_shell_contacts import flat_room, position, spawn


def score(ram):
    return int.from_bytes(ram[0xf34:0xf37], 'little') * 10


def controlled(core, image, base, actors):
    core.restore(base)
    ram = core.ram
    spawn(ram, image, 0, 0x7b, 100)
    for i, (number, x) in enumerate(actors, 1):
        spawn(ram, image, i, number, x)
    core.run(10)
    for i, (_, x) in enumerate(actors, 1):
        position(ram, i, x)
    write_word(ram, 0x94, 99)
    write_word(ram, 0x96, 288)
    initial = ram[0xdbe]
    observed = {}
    for age in range(226):
        core.run()
        if age == 0:
            assert ram[0x1493] == 255
            start = list(ram[0x14c9:0x14c9+len(actors)])
        if age in (0, 16, 32, 40, 55):
            observed[age] = (ram[0xd9] | ram[0x14d5]<<8) - 304
        if age == 55:
            types = list(ram[0x16e1:0x16e7])
    assert observed == {0:0, 16:-3, 32:-34, 40:-38, 55:-23}
    return start, types, (ram[0xdbf], score(ram), ram[0xdbe]-initial)


def authentic_finish(core):
    # Enter and advance the cartridge's own loader across 105's final screens,
    # keeping the controlled player safe during the diagnostic repositioning.
    base = first_course(core)
    enter_room(core, base, '105')
    core.run(50)
    ram = core.ram
    for x in range(4420,4851,2):
        ram[0x71] = ram[0x9d] = 0
        ram[0x1497] = 120
        write_word(ram, 0x1c, 180)
        write_word(ram, 0x1464, 180)
        write_word(ram, 0x94, x)
        write_word(ram, 0x96, 334)
        core.run()
        if ram[0x1493]:
            break
    assert ram[0x1493] == 255 and ram[0x1900] == 0
    targets = sorted((ram[0x9e+i], ram[0xe4+i] | ram[0x14e0+i]<<8)
                     for i in range(12) if ram[0x14c8+i] == 6)
    assert targets == [(0x7b,4832), (0x95,4768)], targets
    core.run(55)
    types = sorted(n for n in ram[0x16e1:0x16e7] if n)
    assert types == [5,7]
    core.run(8)
    assert (ram[0xdbf], score(ram)) == (2,500)
    print('105 native placements:', targets, 'score object IDs', types, '2 coins, 500 points')


def main():
    library, cartridge = map(Path, sys.argv[1:])
    image = cartridge_image(cartridge)
    retained = [i for i in range(201) if image[0x3f659+i] & 2]
    assert retained == [0x35,0x6d,0x7b,0x7c,0xc0,0xc6]
    core = Core(library, image)
    try:
        authentic_finish(core)
        core.lib.retro_reset()
        base = flat_room(core)
        start, _, result = controlled(core,image,base,[(4,130),(0x74,194),(0x35,216),(5,320)])
        assert start == [6,0,8,0] and result == (1,100,0)
        print('Onscreen Koopa, mushroom, Yoshi, offscreen Koopa:', start, result)
        for n, expected in [(1,(1,100,0)),(3,(3,1500,0)),(5,(5,5500,1)),(8,(23,15240,4)),(10,(45,15360,4))]:
            _, types, result = controlled(core,image,base,[(4,125+8*i) for i in range(n)])
            assert result == expected, (n, result)
            print(n, 'simultaneous Koopas, score slots', types, 'coins/points/lives', result)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
