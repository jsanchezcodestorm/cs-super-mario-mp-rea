"""Verify cut heights, star numerals and their complete OAM lifetime on the E1 cartridge."""
from pathlib import Path
import json
import sys

from native_rooms import Core, cartridge_image, enter_room, read_word, write_word
from goal_star_art import TILES, digit_offsets, sprite_color
from hud_tiles import snes_colors
from map_tiles import vram
from probe_shell_contacts import flat_room, position, spawn


def check_cut(core, rom, base, band):
    core.restore(base)
    ram = core.ram
    # Remove the starting room's two pre-existing smoke sprites sharing the tens OAM.
    ram[0x17c0:0x17c4] = bytes(4)
    spawn(ram, rom, 0, 0x7b, 100)
    core.run(10)
    # The native goal moves one pixel up before testing the character.
    y = 304 - band * 4 + 1
    position(ram, 0, 100, y)
    write_word(ram, 0x94, 99)
    write_word(ram, 0x96, y - 12)
    expected = band+1 if band < 30 else (40,50)[band-30]
    for age in range(129):
        core.run()
        assert ram[0x1900] == int(str(expected), 16), (age, band, ram[0x1900])
        stars = {}
        if 0 < age < 128:
            tile = 0xef if age <= 112 else 0xff if age <= 116 else 0x6e if age <= 120 else 0x66
            attr = 0x30 | (ram[0x13] >> 1 & 14)
            for x, slot, digit in ((100,8,expected//10), (132,21,expected%10)):
                if slot == 8 and digit == 0:
                    continue
                for i,(dx,dy) in enumerate(digit_offsets(rom, digit)):
                    stars[slot+i] = (x+dx, 64+dy, tile, attr)
        # Snes9x exposes the complete SNES CPU-side shadow OAM.
        for i in range(8,34):
            address = 0x200 + i*4
            actual = tuple(ram[address:address+4])
            if i in stars:
                assert actual == stars[i] and ram[0x420+i] == 0, (age, i, actual, stars[i])
            else:
                is_star = (64 <= actual[1] <= 96 and 100 <= actual[0] <= 148 and
                           actual[3] & 0xf1 == 0x30 and actual[2] in (0xef,0xff,0x6e,0x66))
                assert not is_star, (age, i, actual)
    return expected


def verify_room_art(core, rom, base, catalog):
    def star_tiles():
        memory = vram(core)
        return [memory[0xc000+32*t:0xc000+32*t+32] for t in TILES]

    core.restore(base)
    reference = star_tiles()
    rooms = [level for level in catalog['levels'].values() if any(s['spriteId'] == 0x7b for s in level['sprites'])]
    for level in rooms:
        room = level['id']
        if room == 'ci2-1':
            # Chocolate Island 2 selects this alternate 0CD stream with fewer than four dragon coins.
            core.restore(base)
            core.ram[0x13bf], core.ram[0x1422] = 0x24, 0
            enter_room(core, core.freeze(), '0cd')
            assert read_word(core.ram,0xce) == int.from_bytes(rom[0x2db1c:0x2db1e], 'little')
        else:
            enter_room(core, base, room)
        core.run(12)
        assert star_tiles() == reference, room
        native = snes_colors(core)
        for i in range(128,256):
            if i % 16 in (1,5):
                assert sprite_color(level['spritePalette'][i]) == native[i], (room,i)
    print(f'{len(rooms)} goal rooms matched all four OBJ tiles and eight live CGRAM palettes.')


if __name__ == '__main__':
    lib, cartridge, catalog = map(Path, sys.argv[1:])
    rom = cartridge_image(cartridge)
    core = Core(lib.resolve(), rom)
    try:
        base = flat_room(core)
        awards = [check_cut(core, rom, base, band) for band in range(32)]
        print('Cut-height awards:', awards)
        print('32 cuts x 129 PAL frames matched native star OAM including position, tile, palette, priority and size.')
        verify_room_art(core, rom, base, json.loads(catalog.read_text()))
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
