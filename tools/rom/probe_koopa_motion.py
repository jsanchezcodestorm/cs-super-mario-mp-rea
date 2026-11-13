"""Measure both travel directions, turn timers and fence traversal on PAL E1."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, write_word
from probe_player_contacts import put_tile
from probe_shell_contacts import flat_room, position, spawn


def prepare(core, rom, base, number, side, terrain):
    core.restore(base)
    r = core.ram
    for address in (0xb6, 0xaa, 0xc2, 0x14ec, 0x14f8, 0x1504, 0x151c, 0x1528, 0x1534,
                    0x1540, 0x1558, 0x1564, 0x1570, 0x157c, 0x1588, 0x15ac, 0x1602, 0x160e, 0x1632, 0x163e):
        r[address] = 0
    for x in range(5, 14):
        for y in range(14, 23):
            solid = (y == 20 and (terrain != 'ledge' or x < 8)) or (terrain == 'wall' and x == 9 and y in (18, 19))
            net = terrain == 'fence' and 5 <= x < 12 and 15 <= y < 20
            put_tile(r, x, y, 0x130 if solid else 0x0b if net else 0x25)
    write_word(r, 0x94, 32 if side < 0 else 180)
    spawn(r, rom, 0, number, 112)
    r[0x15f6] = r[0x166e] & 15
    if terrain == 'fence':
        position(r, 0, 112, 272)
    core.run()
    # Synchronize the random phase only. Facing and speeds are set by native INIT.
    r[0x1570] = 0
    return r


def check_blue_kick(core, rom, base):
    core.restore(base)
    ram = core.ram
    shell, koopa = 6, 4
    spawn(ram, rom, shell, 4, 100)
    spawn(ram, rom, koopa, 2, 160)
    core.run(2)
    position(ram, shell, 125)
    position(ram, koopa, 160)
    ram[0x14c8 + shell], ram[0xb6 + shell], ram[0x157c + shell] = 10, 48, 0
    ram[0x157c + koopa], ram[0x163e + koopa] = 1, 0
    frames = []
    for i in range(110):
        core.run()
        if ram[0x1602 + koopa] == 4:
            assert ram[0x14c8 + shell] == 10 and ram[0xb6 + shell] >= 128
            frames.append(i)
    assert len(frames) == 25 and frames == list(range(frames[0], frames[0] + 25))
    print('Blue shell-less Koopa: 25 consecutive kick poses after the shell reverses direction')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    rom = cartridge_image(args.rom)
    core = Core(args.core, rom)
    try:
        base = flat_room(core)
        for number in range(13):
            for direction in (-1, 1):
                r = prepare(core, rom, base, number, direction, 'floor')
                assert r[0x157c] == int(direction < 0)
                core.run(30)
                x, y = r[0xe4], r[0xd8] + 256*r[0x14d4]
                if number == 10:
                    assert x == 112 and y == 297 and r[0x157c] == 1
                elif number == 11:
                    assert (x, y, r[0x157c]) == (105, 296, 1)
                else:
                    speed = 12 if number in (2, 3, 6, 7, 12) else 8
                    assert r[0xb6] == direction * speed & 255
                    assert (x - 112) * direction > 12
        print('13 Koopa types × 2 player sides: native spawn facing, signed speed, flight axes at PAL 30')
        for terrain in ('ledge', 'wall'):
            for number in range(8):
                r = prepare(core, rom, base, number, 1, terrain)
                first = None
                for age in range(1, 50):
                    core.run()
                    if r[0x15ac] == 8:
                        first = age
                        assert r[0x157c] == 1 and r[0x1602] == 2
                        core.run(7)
                        assert r[0x15ac] == 1 and r[0x1602] == 2
                        break
                if terrain == 'wall':
                    assert first is not None
                else:
                    assert bool(first) == (number in (1, 2, 5, 6))
        print('Eight ground Koopas × wall and ledge: red/blue turn at centre foot, green/yellow over edge; eight-frame turn pose')
        for number, edge, switch in ((34, 88, 104), (35, 45, 61), (36, 133, 149), (37, 67, 83)):
            r = prepare(core, rom, base, number, 1, 'fence')
            core.run(edge)
            assert (r[0x1540], r[0x1632]) == (80, 0)
            core.run(switch - edge)
            assert (r[0x1540], r[0x1632]) == (64, 1)
            pose = (r[0xe4], r[0xd8], r[0x1570])
            core.run(16)
            assert (r[0xe4], r[0xd8], r[0x1570]) == pose
        print('Green/red horizontal and vertical fence Koopas: native edge timer 80, side switch at 64, pause 63–48')
        check_blue_kick(core, rom, base)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
