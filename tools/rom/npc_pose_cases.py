"""Feed known sprite states through the full E1 level scheduler."""
from boss_pixels import oam, trim
from map_tiles import vram
from native_rooms import enter_room, read_word, write_word
from probe_shell_contacts import position, spawn


def state_sample(ram, number, i, x):
    right = i & 1
    ram[0x157c] = 1 - right
    ram[0x1540] = 10
    ram[0x15ac] = 0
    if number in (0x1e, 0x1f, 0xbf):
        group = i >> 1
        write_word(ram, 0x94, x + (65 if right else -65))
        if number == 0x1e:
            # The cloud has its own sprite slot. Only the rider, line and lure
            # belong to this atlas entry.
            for slot in range(1, 12):
                ram[0x14c8 + slot] = 0
            ram[0x14c8] = 8
            ram[0x1558] = 12 if group == 1 else 0
            ram[0x151c] = int(group == 2)
            return f'lakitu/{i}'
        if number == 0x1f:
            ram[0xc2] = 2
            ram[0x1540] = (0x70, 0x68, 0x40, 0x38)[group]
            phase = group * 8
        else:
            ram[0x151c] = ram[0x157c]
            ram[0x14] = phase = group * 4
        name = f'-{number}' + (':right' if right else '')
        return f'{name}/{phase}'
    if 0x22 <= number <= 0x25:
        ram[0x1570] = right << 3
        if i < 4:
            ram[0x1632] = i >> 1
            ram[0x1540] = 0x22
        else:
            turn = i - 4
            ram[0xc2] = turn >> 3
            ram[0x1632] = (turn >> 2) & 1
            ram[0x1540] = (0x38 if turn & 2 else 0x30) + 1
        return f'net{number}/{i}'
    if number in (0x28, 0x37):
        pose = i >> 1
        ram[0xc2] = int(pose != 0)
        ram[0x1570] = 0
        write_word(ram, 0x94, x + (60 if right else -60))
        ram[0x76] = ram[0x157c]
        if number == 0x28:
            ram[0x15ac] = (0, 26, 11, 0, 0)[pose]
            ram[0x1558] = 9 if pose == 4 else 0
        else:
            ram[0x1558] = (0, 0, 9, 5)[pose]
        return f'boo{number}/{i}'
    if number == 0x1c:
        ram[0xc2] = i
        ram[0x1540] = 0
        return f'bill/{i}'
    assert number == 2
    ram[0xc2] = 31
    return f'kick2/{i}'


def check_states(core, rom, base, campaign, atlas):
    rooms = ((0x22, '101', 20), (0x23, '0db', 20), (0x24, '101', 20), (0x25, '101', 20),
             (0x1e, '132', 6), (0x1f, '11c', 8), (0xbf, '116', 4),
             (0x28, '107', 10), (0x37, '107', 8), (0x1c, '119', 8), (2, '106', 2))
    total = 0
    for number, room_id, count in rooms:
        room = campaign['levels'][room_id]
        enter_room(core, base, room_id)
        core.run(6)
        ram = core.ram
        for slot in range(12):
            ram[0x14c8 + slot] = 0
        x = read_word(ram, 0x1a) + 96
        y = read_word(ram, 0x1c) + 85
        spawn(ram, rom, 0, number, x)
        position(ram, 0, x, y)
        ram[0x15f6] = ram[0x166e] & 15
        core.run()
        start = core.freeze()
        memory = vram(core)
        colors = [v.to_bytes(3, 'big') + b'\xff' for v in room['spritePalette']]
        base_slot = None
        for i in range(count):
            core.restore(start)
            position(ram, 0, x, y)
            pose = state_sample(ram, number, i, x)
            core.run()
            first = 64 + ram[0x15ea] // 4
            slots = list(range(first, first + (20 if number == 0x28 else 4)))
            if number == 0x1e:
                if i == 0:
                    base_slot = first
                if i >= 4:
                    # Fishing line uses fixed OAM $0338, then the four OBJs
                    # for the rider, rod and 1-Up at the standard sprite slot.
                    slots = sorted(set(range(78, 86)) | set(range(base_slot, base_slot+4)))
            actual = trim(oam(ram, memory, colors, slots))
            separator = '' if pose.startswith('-') else ':'
            key = f"{room['spriteTileset']}{separator}{pose}"
            assert actual == atlas.get(key), key
            total += 1
    print(f'{total} native state and facing comparisons match (climbers, Boos, bills, shell kicks, moles, Lakitu, wizard).')
