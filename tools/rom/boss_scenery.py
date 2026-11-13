"""Separate Mode 7 arena scenery at the same OBJ comparison depths as the PPU."""
import ctypes as C
from boss_pixels import oam, rgba_palette, video_pixels
from map_tiles import PPU, vram


class Graphics(C.Structure):
    # Prefix of SGFX in the pinned Snes9x core. Z includes the main-screen bit ($20).
    _fields_ = [(k, C.c_uint32) for k in ('pitch', 'stride', 'size')] + [
        (k, C.c_void_p) for k in ('screen', 'sub', 'depth', 'subdepth', 's', 'db', 'zero')
    ] + [('ppl', C.c_uint32)]


def bowser_bridge(raw, depth, gfx, ram, label, entries, save):
    # The captured OBJ video includes Mario in slots 68/69. The masonry
    # repeats every 48 pixels, so use the same phase from the next clean span
    # only for columns covered by the player.
    player_x = ram[0x200 + 4*68]
    pixels = bytearray(256*224*4)
    start, stop = {'parapet': (192, 201), 'wall': (201, 217), 'underside': (217, 224)}[label]
    for y in range(start, stop):
        for x in range(256):
            src = x
            if label == 'parapet' and player_x <= x < player_x + 16:
                src = x + 48 if x < 208 else x - 48
            if depth[y*gfx.ppl+src] <= 1:
                continue
            dest, offset = 4*(y*256+x), 4*(y*256+src)
            pixels[dest:dest+4] = raw[offset:offset+4]
    priorities = {(ram[0x203+4*i] >> 4) & 3 for i in entries}
    if priorities != {3}:
        raise ValueError('Unexpected Bowser bridge OBJ flags')
    return {'file':save(f'bowser-{label}.png',(256,224,pixels)), 'priority':3, 'oam':min(entries)}


def capture_arena(core, layers, name, save):
    tilting = name in ('iggy', 'larry')
    layers.show(31 if tilting else 15 if name == 'bowser' else 30)
    core.run(2)
    w, h, raw = video_pixels(core.frame)
    gfx = Graphics.in_dll(core.lib, 'GFX')
    if w != 256 or h < 224 or not 256 <= gfx.ppl <= 2048:
        raise ValueError('Unexpected native boss viewport')
    h = 224
    base = bytearray(w*h*4)
    stripes = {}
    # Libretro crops the PAL 239-line frame to 224, starting at scanline 7.
    crop = 7
    native = core.frame[2]
    for y in range(h):
        if native[2*y*w:2*(y+1)*w] != C.string_at(gfx.screen+(y+crop)*gfx.pitch,2*w):
            raise ValueError('Native arena framebuffer and depth viewport do not agree')
    depth = C.string_at(gfx.depth+gfx.ppl*crop, gfx.ppl*h)
    for y in range(h):
        for x in range(w):
            src = x if tilting else x % 16
            i = (y*w+src)*4
            dest = (y*w+x)*4
            color = raw[i:i+4]
            z = depth[y*gfx.ppl+src]
            if name == 'bowser':
                color, z = bytes((0, 0, 0, 255)), 1
            if z == 1:
                base[dest:dest+4] = color
            else:
                # Backdrop is black beneath these fully opaque arena pixels.
                base[dest+3] = 255
                band = sum(z > 36 + p*4 for p in range(4))
                if band not in stripes:
                    stripes[band] = bytearray(len(base))
                stripes[band][dest:dest+4] = color
    art = {'background': save(name+'-arena.png', (w,h,base)), 'bands': [], 'scenery': []}
    for band, pixels in sorted(stripes.items()):
        filename = save(f'{name}-bg-{band}.png', (w,h,pixels))
        art['bands'].append({'file': filename, 'beforeObj': band})
    if tilting or name in ('morton', 'roy', 'ludwig', 'bowser'):
        ram = core.ram
        if name == 'bowser':
            # The three rows straddle Mario's OAM slots. Slot 69 at Y=192
            # is Mario's shoe, not part of the bridge.
            groups = {'parapet': range(15, 21), 'wall': range(111, 128), 'underside': range(5, 15)}
        elif tilting:
            groups = {'scenery': range(108, 124)}
        else:
            groups = {'scenery': range(64)}
        for label, entries in groups.items():
            if name == 'bowser':
                art['scenery'].append(bowser_bridge(raw, depth, gfx, ram, label, entries, save))
                continue
            owner = {}
            image = oam(ram, vram(core), rgba_palette(PPU.in_dll(core.lib,'PPU')), entries, owner)
            filename = save(f'{name}-{label}.png', image)
            art['scenery'].append({'file': filename, **owner})
    layers.show(0)
    return art
