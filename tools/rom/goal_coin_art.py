"""Sprite-status 06 uses palette A for its smoke and the ordinary spinning coin."""
from boss_pixels import oam
from hud_tiles import canvas, crop, snes_colors, stamp
from map_tiles import vram

SCORE_TYPES = (5, 7, 9, 11, 13, 15, 17, 18)


def goal_coin_sheet(core, rom):
    ram, memory, colors = bytearray(core.ram), vram(core), snes_colors(core)
    sheet = canvas(24*(4+len(SCORE_TYPES)), 16)

    def draw(index, entries):
        for i, (x, tile, attr, size) in enumerate(entries):
            ram[0x200+i*4:0x204+i*4] = bytes([x, 0, tile, attr])
            ram[0x420+i] = size
        pixels = oam(ram, memory, colors, range(len(entries)))
        stamp(sheet, crop(pixels, 0, 0, 24, 16), index*24, 0)

    for i, tile in enumerate((0x66, 0x64, 0x62, 0x60)):
        draw(i, [(0,tile,0x24,2)])
    for i, kind in enumerate(SCORE_TYPES):
        attr = 0x30 | (8 if kind < 14 else rom[0x12de2 + kind-14])
        entries = [(8,rom[0x12d4c+kind],attr,0), (16,rom[0x12d62+kind],attr,0)]
        if kind >= 17:
            entries.append((0,0x5f,0x34,0))
        draw(4+i, entries)
    return sheet
