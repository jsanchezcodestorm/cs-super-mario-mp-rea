"""Hit the same Map16 block from below repeatedly in a controlled PAL E1 room."""
import argparse
from pathlib import Path
from native_rooms import Core, cartridge_image, first_course, enter_room, write_word, read_word
from probe_player_contacts import foreground_address, put_tile


def run(core, start, tile, jumps):
    core.restore(start)
    ram = core.ram
    put_tile(ram, 4, 14, tile)
    at = foreground_address(4, 14)
    last = None
    elapsed = 0
    for jump, wait in enumerate(jumps, 1):
        for frame in range(wait):
            core.run(1, int(frame < 12))
            elapsed += 1
            current = (ram[at] + 256*ram[at+0x10000], ram[0xdbf],
                       10*int.from_bytes(ram[0xf34:0xf37], 'little'))
            if current != last:
                print(f'{tile:03X} jump={jump} frame={elapsed} tile={current[0]:03X} coins={current[1]} score={current[2]}')
                last = current


def turn(core, start):
    core.restore(start)
    ram = core.ram
    put_tile(ram,4,14,0x11e)
    address = foreground_address(4,14)
    first = None
    lift = [-4,-7,-9,-9,-9,-7]
    for frame in range(280):
        core.run(1,int(frame<12))
        tile = ram[address] + 256*ram[address+0x10000]
        if first is None:
            if tile == 0x11e:
                continue
            first = frame
        age = frame-first
        expected = 0x152 if age < 6 else 0x48 if age < 255 else 0x11e
        assert tile == expected, (age, tile, expected)
        if age < 6:
            assert tuple(ram[0x21e:0x220]) == (0x40,0x20)
            assert ram[0x21d]+read_word(ram,0x1c)-224 == lift[age]
        if age == 255:
            print('11E: six bounce OBJ frames, rotating tile 048, solid on PAL frame 255')
            return
    raise AssertionError('Turn block did not complete its cycle')


def flying(core, image, start):
    from probe_shell_contacts import spawn, position, STATUS
    ram = core.ram
    for number in (0x83, 0x84):
        for col in range(4, 8):
            core.restore(start)
            x = col * 16
            spawn(ram, image, 10, number, x)
            position(ram, 10, x, 14*16)
            write_word(ram, 0x94, x)
            core.run(2)
            for frame in range(60):
                core.run(1, int(2 <= frame <= 16))
            state = ram[0xc2+10]
            items = [ram[0x9e+i] for i in range(12) if i != 10 and ram[STATUS+i] >= 8]
            print(f'flying {number:02X} col={col} state={state} coins={ram[0xdbf]} items={items}')
            if state != 2 or ((ram[0xdbf] != 1) if col == 4 else ([0x74, 0x74, 0x78][col-5] not in items)):
                raise AssertionError('Unexpected flying block reward')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(), image)
    try:
        enter_room(core, first_course(core), '11a')
        ram = core.ram
        for col in range(16):
            for row in range(9, 19):
                put_tile(ram, col, row, 0x130 if row == 18 else 0x25)
        for slot in range(12):
            ram[0x14c8+slot] = 0
        write_word(ram, 0x94, 64)
        write_word(ram, 0x96, 18*16-32)
        ram[0x7b] = ram[0x7d] = 0
        core.run(15)
        start = core.freeze()
        for tile in (0x124, 0x123, 0x11f):
            run(core, start, tile, [62, 220, 65, 64])
        turn(core, start)
        flying(core, image, start)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
