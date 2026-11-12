"""Sample the independent layer-2 oscillators in the European cart."""
from native_rooms import enter_room
from native_rooms import read_word, write_word


def oscillation(core, base, room):
    enter_room(core, base, room['id'])
    ram = core.ram
    horizontal = any(sprite['spriteId'] == 0xef for sprite in room['sprites'])
    axis = 0 if horizontal else 2
    camera = 0x1a + axis
    layer = 0x1e + axis
    positions = []
    for frame in range(4096):
        displacement = (read_word(ram, camera) - read_word(ram, layer) + 32768) % 65536 - 32768
        positions.append(displacement)
        write_word(ram, 0x94, read_word(ram, 0x1a) + 96)
        write_word(ram, 0x96, read_word(ram, 0x1c) + 96)
        ram[0x71] = ram[0x9d] = ram[0x7b] = ram[0x7d] = 0
        ram[0x1497] = 120
        ram[0xf31] = 9
        core.run()
        if ram[0x100] != 0x14:
            raise RuntimeError('Left gameplay during layer capture in ' + room['id'])
    # An exact repeat of two full cycles and the subsequent tail distinguishes a
    # loop from a pause at an endpoint. Preserve any initialization frames.
    for period in range(2, len(positions) // 3):
        if positions[-period:] != positions[-2*period:-period]:
            continue
        start = len(positions) - period
        while start > 0 and positions[start-1] == positions[start+period-1]:
            start -= 1
        if start > len(positions) - 3 * period:
            continue
        if min(positions[start:start+period]) == max(positions[start:start+period]):
            continue
        return {'axis': 'x' if horizontal else 'y', 'start': start, 'samples': positions[:start+period]}
    raise RuntimeError('Could not resolve repeating layer motion in ' + room['id'])
