"""Rebuild the PAL status bar's native BG3 tilemap and dynamic cells."""
import struct
from map_tiles import PPU, vram

# x, y, digits, row in the character strip, height of a digit.
FIELDS = {
    'lives': (32,16,2,0,8), 'coins': (224,8,2,0,8),
    'timer': (152,16,3,8,8), 'score': (184,16,7,0,8), 'stars': (96,8,2,16,16)
}


def canvas(width,height):
    return width,height,bytearray(width*height*4)


def crop(image,x,y,width,height):
    stride,_,pixels = image
    return width,height,b''.join(pixels[4*((y+i)*stride+x):4*((y+i)*stride+x+width)] for i in range(height))


def stamp(target, source, x, y):
    stride,_,dest = target
    width,height,src = source
    for row in range(height):
        for col in range(width):
            index = 4*(row*width+col)
            if src[index+3]:
                out = 4*((y+row)*stride+x+col)
                dest[out:out+4] = src[index:index+4]


def snes_colors(core):
    # Match the RGB565 expansion in the reference frontend, including its sixth green bit.
    colors = []
    for word in PPU.in_dll(core.lib,'PPU').cgram:
        g = word >> 5 & 31
        colors.append(bytes(((word & 31)*255//31, ((g<<1)|(g>>4))*255//63, (word>>10 & 31)*255//31,255)))
    return colors


class StatusPlane:
    def __init__(self, core):
        bg = PPU.in_dll(core.lib,'PPU').bg[2]
        self.map, self.base = 2*bg.map, 2*bg.tiles
        self.memory = vram(core)
        self.colors = snes_colors(core)

    def tile(self, descriptor):
        image = canvas(8,8)
        _,_,pixels = image
        palette = 4*(descriptor >> 10 & 7)
        start = self.base + 16*(descriptor & 0x3ff)
        for y in range(8):
            row = start + 2*(7-y if descriptor & 0x8000 else y)
            for x in range(8):
                bit = x if descriptor & 0x4000 else 7-x
                index = ((self.memory[row]>>bit)&1) | (((self.memory[row+1]>>bit)&1)<<1)
                if index:
                    pos = 4*(8*y+x)
                    pixels[pos:pos+4] = self.colors[palette+index]
        return image

    def base_bar(self):
        image = canvas(256,32)
        dynamic = {(64+i*8,8) for i in range(4)}
        for x,y,digits,_,height in FIELDS.values():
            dynamic.update((x+i*8,y+j*8) for i in range(digits) for j in range(height//8))
        for y in range(4):
            for x in range(32):
                if (x*8,y*8) in dynamic:
                    continue
                # PAL displays tilemap rows 1..4 at raster y=0..31.
                address = self.map+2*((y+1)*32+x)
                descriptor = struct.unpack_from('<H', self.memory, address)[0]
                stamp(image,self.tile(descriptor), x*8, y*8)
        return image

    def digits(self, rom):
        image = canvas(80,32)
        for i in range(10):
            stamp(image,self.tile(0x3800|i),8*i,0)
            stamp(image,self.tile(0x3c00|i),8*i,8)
            # E1 TallNumberTiles maps each digit to upper and lower character IDs.
            upper,lower = rom[0xe08+i*2:0xe0a+i*2]
            stamp(image,self.tile(0x3800|upper),8*i,16)
            stamp(image,self.tile(0x3800|lower),8*i,24)
        return image


def set_counters(core, player, counters):
    ram = core.ram
    ram[0xdb3] = player
    ram[0xdbe] = counters['lives']-1
    ram[0xdbf] = counters['coins']
    ram[0xf48+player] = counters['stars']
    ram[0x1422] = counters['dragon']
    ram[0xf30] = 34
    for i,digit in enumerate(f"{counters['timer']:03d}"):
        ram[0xf31+i] = int(digit)
    for i,b in enumerate((counters['score']//10).to_bytes(3,'little')):
        ram[0xf34+3*player+i] = b


def render_counters(base, digits, dragon, counts):
    image = base[0],base[1],bytearray(base[2])
    for key,(x,y,places,source_y,height) in FIELDS.items():
        text = str(counts[key]).rjust(places)
        for i,char in enumerate(text):
            if char != ' ':
                stamp(image,crop(digits,int(char)*8,source_y,8,height),x+i*8,y)
    if counts['dragon'] < 5:
        for i in range(counts['dragon']):
            stamp(image,dragon,64+8*i,8)
    return image
