"""Read an event's OAM graphics and project its native target onto the map."""
import struct
from map_tiles import PPU, png


def rom_word(image, address):
    offset = (address >> 16)*0x8000 + (address & 0x7fff)
    return struct.unpack_from('<H',image,offset)[0]


def cell_position(index, region):
    x = ((index&15)+((index>>8)&1)*16)*16
    y = (((index>>4)&15)+((index>>9)&1)*16)*16
    return x-(256 if region>=4 else 0), y-[0,0,160,336,0,160,336][region]


def effect_bounds(image, ram, region, event, stage):
    if stage == 1:
        index = rom_word(image,0x04e5b6+2*ram[0x13d1])
    elif stage == 6:
        index = rom_word(image,0x04d85d+event*2)
    else:
        return None, ()
    return cell_position(index,region), range(32,36)


class RevealArt:
    def __init__(self):
        self.tiles = {}
        self.cache = {}
        self.groups = {}

    def sprite(self, gfx, colors, tile, attr):
        start = 0xc000+((attr&1)*256+tile)*32
        data = gfx[start:start+32]
        palette = tuple(colors[128+8*(attr&14):144+8*(attr&14)])
        key = data, palette, attr&0xc0
        if key in self.cache:
            return self.cache[key]
        pixels = bytearray(8*8*4)
        for y in range(8):
            row = (7-y if attr&128 else y)*2
            planes = [data[row+i] for i in (0,1,16,17)]
            for x in range(8):
                bit = x if attr&64 else 7-x
                value = sum(((p>>bit)&1)<<i for i,p in enumerate(planes))
                if value:
                    pos = 4*(8*y+x)
                    pixels[pos:pos+4] = palette[value]
        tile_id = self.tiles.setdefault(bytes(pixels),len(self.tiles)) if any(pixels[3::4]) else None
        self.cache[key] = tile_id
        return tile_id

    def capture(self, core, memory, origin, slots):
        ram = core.ram
        if origin is None or not slots or all(ram[0x201+4*i] == 240 for i in slots):
            return -1
        # $04:EC67 subtracts an additional pixel from the screen Y anchor.
        screen_x = ram[0x1b82]-ram[0x1e]
        screen_y = ram[0x1b83]-ram[0x20]-1
        colors = [bytes(((c&31)*255//31, ((c>>5)&31)*255//31, ((c>>10)&31)*255//31, 255))
                  for c in PPU.in_dll(core.lib,'PPU').cgram]
        parts = []
        for i in reversed(slots):
            x,y,tile,attr = ram[0x200+4*i:0x204+4*i]
            if y == 240:
                continue
            dx,dy = ((x-screen_x+128)&255)-128, ((y-screen_y+128)&255)-128
            sprite = self.sprite(memory,colors,tile,attr)
            if sprite is not None:
                parts.append((dx,dy-1,sprite))
        return self.groups.setdefault(tuple(parts),len(self.groups)) if parts else -1

    @staticmethod
    def place(fx, frame, origin, group):
        placement = (*origin,group) if group>=0 else (0,0,-1)
        if fx and fx[-1][0] == frame:
            fx.pop()
        if not fx or fx[-1][1:] != placement:
            fx.append((frame,*placement))

    def write(self, output):
        width, height = 256, ((len(self.tiles)+31)//32)*8
        pixels = bytearray(width*height*4)
        for tile,index in self.tiles.items():
            x,y = index%32*8,index//32*8
            for r in range(8):
                pos = 4*((y+r)*width+x)
                pixels[pos:pos+32] = tile[r*32:(r+1)*32]
        (output/'reveal.png').write_bytes(png(width,height,pixels,alpha=True))
