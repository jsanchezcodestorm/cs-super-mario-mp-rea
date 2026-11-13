"""Decode 8x8 and 16x16 PAL overworld OBJ tiles from VRAM and CGRAM."""
from boss_pixels import png, rgba_palette
from map_tiles import PPU, vram


class Tiles:
    def __init__(self, core):
        self.memory = vram(core)
        self.palette = rgba_palette(PPU.in_dll(core.lib, 'PPU'))
        self.tiles = {}
        self.priorities = []
        self.image = []

    def add(self, char, flags, side):
        key = char, flags, side
        if key in self.tiles:
            return self.tiles[key]
        pixels = bytearray(16*16*4)
        for y in range(side):
            for x in range(side):
                sx, sy = (side-1-x if flags & 64 else x), (side-1-y if flags & 128 else y)
                tile = (flags & 1)*256 + ((char + 16*(sy//8)) & 240) + ((char+sx//8)&15)
                at = 0xc000 + 32*tile + 2*(sy&7)
                color = sum(((self.memory[at+16*(p//2)+p%2] >> (7-sx%8)) & 1) << p for p in range(4))
                if color:
                    i = 4*(16*y+x)
                    pixels[i:i+4] = self.palette[128 + 8*(flags&14) + color]
        index = len(self.image)
        self.image.append(pixels)
        self.priorities.append((flags >> 4) & 3)
        self.tiles[key] = index
        return index

    def write(self, path):
        width = 16*16
        height = 16*((len(self.image)+15)//16)
        sheet = bytearray(width*height*4)
        for i,pixels in enumerate(self.image):
            for y in range(16):
                p = 4*(width*(16*(i//16)+y) + 16*(i%16))
                sheet[p:p+64] = pixels[y*64:(y+1)*64]
        path.write_bytes(png(width,height,sheet))
