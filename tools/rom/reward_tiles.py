"""Compose the E1 score and spinning coin OBJ tiles on a transparent sheet."""
from boss_pixels import oam
from hud_tiles import canvas, crop, stamp, snes_colors
from map_tiles import vram


def reward_sheet(core, rom):
    ram, memory, colors = bytearray(core.ram), vram(core), snes_colors(core)
    sheet = canvas(34*16, 16)

    def frame(number, parts):
        for i, (x, y, tile, attr, size) in enumerate(parts):
            ram[0x200+i*4:0x204+i*4] = bytes([x, y, tile, attr])
            ram[0x420+i] = size
        pixels = oam(ram, memory, colors, range(len(parts)))
        stamp(sheet, crop(pixels, 0, 0, 16, 16), number*16, 0)

    # PointTile1, PointTile2 in bank 02, attributes from ScoreSprGfx.
    for i in range(1, 14):
        frame(i, [(0, 0, rom[0x12d4c+i], 0x38, 0), (8, 0, rom[0x12d62+i], 0x38, 0)])
    frame(14, [(0, 0, 0xe8, 0x24, 2)])
    for i, tile in enumerate([0xea, 0xfa, 0xea]):
        frame(15+i, [(4, 0, tile, 0x24, 0), (4, 8, tile, 0xa4, 0)])
    for i, tile in enumerate((0x66, 0x64, 0x62, 0x60)):
        frame(18+i, [(0, 0, tile, 0x20, 2)])
    for i, tile in enumerate((0x66, 0x6e, 0xff)):
        frame(22+i, [(0, 0, tile, 0x26, 0)])
    frame(25, [(0, 0, 0x2a, 0x20, 2)])
    frame(26, [(0, 0, 0x40, 0x20, 2)])
    for i, tile in enumerate((0x6d, 0x6c, 0x5c)):
        frame(27+i, [(0, 0, tile, 0x26, 0)])
    for i, tile in enumerate((0x3c, 0x3d)):
        frame(30+i, [(0, 0, tile, 0x20, 0)])
    # Smoke sprite 02 uses four 8x8 tiles in OAM $F0..$FC.
    for phase in (0, 1):
        a, b = 0x7c + phase, 0x7d - phase
        top = 0x20 | (phase << 6)
        bottom = top ^ 0xc0
        frame(32+phase, [(0, 0, a, top, 0), (8, 0, b, top, 0),
                         (0, 8, b, bottom, 0), (8, 8, a, bottom, 0)])
    return sheet
