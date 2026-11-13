"""Extract the E1 cluster OBJ tiles, palette ramps, coordinates and OAM slots."""
import argparse
import json
from pathlib import Path
from native_rooms import Core, cartridge_image, first_course, enter_room
from boss_pixels import png, oam, rgba_palette
from map_tiles import vram, PPU


def read(image, address, length):
    offset = ((address >> 16) & 127) * 32768 + (address & 32767)
    return image[offset:offset+length]


def color(word):
    return bytes(((word & 31)*255//31, ((word >> 5) & 31)*255//31, ((word >> 10) & 31)*255//31, 255))


def capture(core, image, output):
    base = first_course(core)
    enter_room(core, base, '004')
    core.run(16)
    ram, memory = core.ram, vram(core)
    palette = rgba_palette(PPU.in_dll(core.lib, 'PPU'))
    tiles = read(image, 0x02fbb3, 8)
    # Rows 0 and 1 use native palettes 9 and F. The next eight rows use
    # the colour uploads performed by CODE_038239 as the fog appears.
    sheet = bytearray(128*160*4)
    for row in range(10):
        if row >= 2:
            raw = read(image, 0x03b982 + (row-2)*16, 16)
            for i in range(8):
                palette[240+i] = color(int.from_bytes(raw[i*2:i*2+2], 'little'))
        for i, tile in enumerate(tiles):
            ram[0x200:0x204] = (32, 32, tile, 0x33 if row == 0 else 0x3f)
            ram[0x420] = 2
            _, _, pixels = oam(ram, memory, palette, [0])
            for y in range(16):
                start = ((32+y)*256+32)*4
                dest = (128*(row*16+y)+i*16)*4
                sheet[dest:dest+64] = pixels[start:start+64]
    (output/'boo-clusters.png').write_bytes(png(128, 160, sheet))
    circle = read(image, 0x07f7db, 512)
    radius = [(int.from_bytes(circle[i:i+2],'little')*80 + 128)//256 for i in range(0,512,2)]
    rings = read(image, 0x02fa78, 20)
    data = {'radius': radius, 'ringAngles': [int.from_bytes(rings[i:i+2],'little') for i in range(0,20,2)],
            'slots': [64+b//4 for b in read(image, 0x02ff3e, 20)],
            'fog': [list(read(image, address, 20)) for address in (0x02aa0b, 0x02aa1f)]}
    (output/'boo-clusters.json').write_text(json.dumps(data,separators=(',',':')))
    print('Boo clusters: 8 native tile selections, 10 palette rows, 20 OAM slots and 512 ring phases.')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('core', 'rom', 'generated'):
        p.add_argument(name,type=Path)
    args = p.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core.resolve(),image)
    try:
        capture(core,image,args.generated)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
