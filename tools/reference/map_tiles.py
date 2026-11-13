"""Decode two SNES Mode 1 background layers into 8-pixel RGB tiles."""
import ctypes as C
import struct
import zlib

U8, U16, U32 = C.c_uint8, C.c_uint16, C.c_uint32


class BG(C.Structure):
    _fields_ = [('map', U16), ('x', U16), ('y', U16), ('size', U8),
                ('tiles', U16), ('quadrants', U16)]


class PPU(C.Structure):
    # Prefix of Snes9x's SPPU at the revision in tools/extract.mjs.
    _fields_ = [('vma', U8*10), ('wram', U32), ('bg', BG*4), ('mode', U8),
                ('priority', U8), ('flip', U8), ('read', U8), ('addr', U8),
                ('save', U8), ('cgram', U16*256)]


def vram(core):
    return bytes((U8*65536).from_address(core.lib.retro_get_memory_data(3)))


def png(width, height, pixels, alpha=False):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind+data))
    stride = width * (4 if alpha else 3)
    rows = b''.join(b'\x00' + pixels[i:i+stride] for i in range(0, len(pixels), stride))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB',width,height,8,6 if alpha else 2,0,0,0))
            + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))


def paste(pixels, width, x, y, tile):
    for row in range(8):
        pos = ((y+row)*width+x)*3
        pixels[pos:pos+24] = tile[row*24:row*24+24]


class MapTiles:
    def __init__(self, core, region):
        ppu = PPU.in_dll(core.lib, 'PPU')
        if ppu.mode != 1:
            raise ValueError('expected a Mode 1 overworld')
        self.width, self.height = (512,512) if region == 0 else (256,160)
        self.palette = [bytes(((v&31)*255//31,((v>>5)&31)*255//31,((v>>10)&31)*255//31))
                        for v in ppu.cgram]
        self.gfx = vram(core)
        self.bases = [2*b.tiles for b in (ppu.bg[1],ppu.bg[0])]
        self.cells = []
        top = [0,0,160,336,0,160,336][region]
        left = 256 if region >= 4 else 0
        for y in range(0,self.height,8):
            for x in range(0,self.width,8):
                sx, sy = (left+x)//8, (top+y)//8
                addresses = []
                for bg in (ppu.bg[1],ppu.bg[0]):
                    qx = sx//32 if bg.quadrants&1 else 0
                    qy = sy//32*(2 if bg.quadrants&1 else 1) if bg.quadrants&2 else 0
                    addresses.append((2*bg.map+(qx+qy)*2048+(sy%32*32+sx%32)*2)&65535)
                self.cells.append((x,y,*addresses))

    def words(self, memory, addresses):
        return tuple(struct.unpack_from('<H', memory, addr)[0] for addr in addresses)

    def tile(self, memory, addresses):
        return self.raster(self.words(memory, addresses), self.gfx, self.palette)

    def raster(self, words, gfx, palette):
        pixels = bytearray(palette[0]*64)
        for base, tile in zip(self.bases, words):
            start = (base+(tile&1023)*32)&65535
            for row in range(8):
                pos = start + 2*(7-row if tile&32768 else row)
                a,b,c,d = [gfx[(pos+p)&65535] for p in (0,1,16,17)]
                for col in range(8):
                    bit = col if tile&16384 else 7-col
                    value = (a>>bit&1) + 2*(b>>bit&1) + 4*(c>>bit&1) + 8*(d>>bit&1)
                    if value:
                        i = (row*8+col)*3
                        pixels[i:i+3] = palette[((tile>>10)&7)*16+value]
        return bytes(pixels)

    def image(self):
        pixels = bytearray(self.width*self.height*3)
        for x,y,*addresses in self.cells:
            paste(pixels,self.width,x,y,self.tile(self.gfx,addresses))
        return png(self.width,self.height,pixels)
