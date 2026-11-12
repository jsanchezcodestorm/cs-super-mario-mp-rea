"""Decode the original Mode 7 tile plane and 4bpp OBJ plane with transparency."""
import struct
import zlib


def png(width, height, pixels):
    def chunk(kind, payload):
        checksum = zlib.crc32(kind + payload)
        return struct.pack('>I', len(payload)) + kind + payload + struct.pack('>I', checksum)
    stride = width * 4
    rows = b''.join(b'\0' + pixels[i:i+stride] for i in range(0, len(pixels), stride))
    header = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')


def rgba_palette(ppu):
    return [bytes(((word & 31)*255//31, (word>>5 & 31)*255//31,
                   (word>>10 & 31)*255//31, 255)) for word in ppu.cgram]


def mode7(memory, colors, tile_x, tile_y, width, height):
    pixels = bytearray(width*height*4)
    for y in range(height):
        for x in range(width):
            tile = memory[2*(128*(tile_y+y//8)+tile_x+x//8)]
            index = memory[128*tile+2*(8*(y%8)+x%8)+1]
            if index:
                pos = 4*(width*y+x)
                pixels[pos:pos+4] = colors[index]
    return width, height, pixels


def oam(ram, memory, colors, entries):
    width, height = 256, 224
    pixels = bytearray(width*height*4)
    for entry in reversed(entries):
        x, y, tile, attr = ram[0x200+4*entry:0x204+4*entry]
        size = ram[0x420+entry]
        if size & 1:
            x -= 256
        if y >= 224:
            continue
        side = 16 if size & 2 else 8
        for dy in range(side):
            for dx in range(side):
                if not (0 <= x+dx < width and y+dy < height):
                    continue
                sx = side-1-dx if attr & 64 else dx
                sy = side-1-dy if attr & 128 else dy
                part = (attr & 1)*256+((tile+16*(sy//8)) & 240)+((tile+sx//8) & 15)
                at = 0xc000 + part*32 + (sy%8)*2
                index = 0
                for plane in range(4):
                    index |= ((memory[at+(plane//2)*16+plane%2] >> (7-sx%8)) & 1) << plane
                if index:
                    pos = 4*((y+dy)*width+x+dx)
                    pixels[pos:pos+4] = colors[128+8*(attr & 14)+index]
    return width, height, pixels


def trim(image):
    width, height, pixels = image
    visible = [i for i in range(width*height) if pixels[i*4+3]]
    if not visible:
        raise ValueError('No visible pixels in original boss frame')
    x0, x1 = min(i%width for i in visible), max(i%width for i in visible)+1
    y0, y1 = visible[0]//width, visible[-1]//width+1
    rows = [pixels[4*(y*width+x0):4*(y*width+x1)] for y in range(y0,y1)]
    return x1-x0, y1-y0, b''.join(rows)


def video_pixels(frame):
    width, height, raw = frame
    pixels = bytearray()
    for word, in struct.iter_unpack('<H',raw):
        pixels.extend(((word>>11)*255//31, (word>>5 & 63)*255//63, (word & 31)*255//31,255))
    return width, height, pixels
