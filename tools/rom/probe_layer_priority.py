"""Compare overlapping native OBJ/BG pixels at the same PAL frame in repeatable scenes."""
import argparse
import ctypes
from pathlib import Path

from boss_capture import LayerSwitch
from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word
from map_tiles import PPU


def overlap(clear, first, second, together, region):
    # If the colors match, the final pixel cannot distinguish the two orders.
    count = [0, 0]
    for i in region:
        a, b = first[i], second[i]
        if a == b or a == clear[i] or b == clear[i]:
            continue
        pixel = together[i]
        if pixel not in (a, b):
            raise AssertionError('Unexpected color math in the isolated comparison')
        count[int(pixel == b)] += 1
    return count


def compare(core, switch, layer):
    state = core.freeze()
    clear = switch.capture(state, 31)
    sprites = switch.capture(state, 15)
    background = switch.capture(state, 31 ^ layer)
    pair = switch.capture(state, 15 ^ layer)
    ram = core.ram
    x = read_word(ram, 0x94) - read_word(ram, 0x1A)
    y = read_word(ram, 0x96) - read_word(ram, 0x1C)
    window = [py*256 + px for py in range(max(40, y-2), min(224, y+38))
              for px in range(max(0, x-4), min(256, x+20))]
    obj_wins = overlap(clear, sprites, background, pair, window)
    bg_wins = None
    if layer != 1:
        terrain = switch.capture(state, 30)
        pair = switch.capture(state, 30 ^ layer)
        bg_wins = overlap(clear, terrain, background, pair, range(40*256, 224*256))
    core.restore(state)
    switch.show(0)
    return obj_wins, bg_wins


def bg2_priority_override(core):
    # Repeat a real layer-2 scene with only bit 13 changed. This isolates
    # priority from palette, collision, graphics, scroll and sprite flags.
    bg = PPU.in_dll(core.lib, 'PPU').bg[1]
    assert bg.quadrants == 3
    mem = (ctypes.c_uint8*65536).from_address(core.lib.retro_get_memory_data(3))
    for tile in range(64*64):
        mem[(2*bg.map + 2*tile + 1) & 65535] |= 0x20


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    core.capture_video = True
    try:
        switch, base = LayerSwitch(core), first_course(core)
        for room, layer, position, obj_front, terrain_front in [
            ('106', 1, None, True, None), ('1c9', 1, None, False, None), ('0bd', 1, None, False, None),
            ('1cf', 2, (96, 280), True, True), ('002', 4, (88, 385), False, False),
            ('127', 4, (140, 386), False, False),
        ]:
            enter_room(core, base, room)
            for slot in range(12):
                core.ram[0x14C8 + slot] = 0
            if position:
                core.run(60)
                write_word(core.ram, 0x94, position[0])
                write_word(core.ram, 0x96, position[1])
                core.ram[0x7B] = core.ram[0x7D] = 0
                core.run(2)
            else:
                core.run(3)
            for override in ([False, True] if room == '1cf' else [False]):
                if override:
                    bg2_priority_override(core)
                a, b = compare(core, switch, layer)
                assert a[0 if obj_front != override else 1] > 0 and 0 in a, (room, a)
                if terrain_front is not None:
                    assert b[0 if terrain_front != override else 1] > 0 and 0 in b, (room, b)
                print(f'{room}, BG{layer.bit_length()}, high-bit override {override}: '
                      f'[OBJ, selected BG] {a}; [BG1, selected BG] {b}.')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
