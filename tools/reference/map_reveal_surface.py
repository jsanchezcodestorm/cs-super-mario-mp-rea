"""Capture the PPU's blended road pixels, with unrelated scenery left transparent."""
from functools import lru_cache
from map_paths import set_word


def center_camera(ram, region, point):
    left = 256 if region >= 4 else 0
    top = [0,0,160,336,0,160,336][region]
    x, y = point[0]+left-96, point[1]+top-88
    for address,value in ((0x1a,x),(0x1e,x),(0x1c,y),(0x20,y)):
        set_word(ram,address,value)
    # Remove normal OW actors in this diagnostic view so the event is the only OBJ.
    ram[0xde5:0xdf5] = bytes(16)
    set_word(ram,0x1f17,0xff00)
    set_word(ram,0x1f19,0xff00)


def surface(frame, side):
    width,height,raw = frame
    if width != 256 or height != 224:
        raise ValueError('Expected the cropped PAL framebuffer')
    # The frame starts at native scanline seven. The map is offset one more
    # line by the scroll register, putting the centered target at (96,80).
    rows = [raw[2*((80+y)*width+96):2*((80+y)*width+96+side)] for y in range(side)]
    return b''.join(rows)


@lru_cache(maxsize=2048)
def rgba(word):
    return bytes(((word>>11)*255//31, ((word>>6)&31)*255//31, (word&31)*255//31,255))


class RoadStep:
    def __init__(self, origin, grid, baseline):
        self.origin = origin
        self.grid = grid
        self.baseline = baseline
        self.frames = []

    def add(self, frame, pixels):
        if not self.frames or self.frames[-1][1] != pixels:
            self.frames.append((frame,pixels))

    def finish(self, art, fx, settled, end):
        side = self.grid*8
        base = memoryview(self.baseline).cast('H')
        final_group = -1
        for frame,pixels in self.frames:
            sample = memoryview(pixels).cast('H')
            parts = []
            for y in range(0,side,8):
                for x in range(0,side,8):
                    tile = bytearray(8*8*4)
                    for dy in range(8):
                        for dx in range(8):
                            idx = (y+dy)*side + x+dx
                            if sample[idx] != base[idx]:
                                target = 4*(dy*8+dx)
                                tile[target:target+4] = rgba(sample[idx])
                    if any(tile[3::4]):
                        parts.append((x,y,art.tiles.setdefault(bytes(tile),len(art.tiles))))
            final_group = art.groups.setdefault(tuple(parts),len(art.groups)) if parts else -1
            art.place(fx,frame,self.origin,final_group)
        if final_group >= 0:
            settled.append((end,*self.origin,final_group))
        art.place(fx,end,(0,0),-1)
