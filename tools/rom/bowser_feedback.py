"""Record Bowser throwing a Mechakoopa and reacting when one hits his head."""
import ctypes as C
from functools import lru_cache
from boss_scenery import Graphics
from probe_shell_contacts import position


@lru_cache(maxsize=65536)
def rgba(word):
    return bytes((((word >> 11) & 31)*255//31, ((word >> 5) & 63)*255//63, (word & 31)*255//31, 255))


def car_pixels(core, boss):
    # Only BG1 is enabled. Depth 39 is the visible Mode 7 car, including
    # its native rotation. Black detail inside the car remains opaque.
    g = Graphics.in_dll(core.lib, 'GFX')
    depth = C.string_at(g.depth + 7*g.ppl, 224*g.ppl)
    rows = [depth[y*g.ppl:y*g.ppl+256] for y in range(224)]
    occupied = [y for y,row in enumerate(rows) if 39 in row]
    y0, y1 = occupied[0], occupied[-1]
    x0 = min(rows[y].index(39) for y in occupied)
    x1 = max(rows[y].rindex(39) for y in occupied)
    w, h = x1-x0+1, y1-y0+1
    raster = memoryview(core.frame[2]).cast('H')
    pixels = bytearray(w*h*4)
    for y in occupied:
        for x in range(x0, x1+1):
            if rows[y][x] == 39:
                start = ((y-y0)*w+x-x0)*4
                pixels[start:start+4] = rgba(raster[y*256+x])
    r = core.ram
    bx = r[0xe4+boss] + 256*r[0x14e0+boss] - (r[0x1a] + 256*r[0x1b])
    by = r[0xd8+boss] + 256*r[0x14d4+boss] - (r[0x1c] + 256*r[0x1d])
    # Clip $25 is Bowser's vulnerable head at (-14,+4) size 60x20.
    # Anchor the pixels to the centre of that hitbox, also during recoil.
    return (w, h, bytes(pixels)), (x0-bx-16, y0-by-14)


def capture_bowser_feedback(core, layers, save):
    layers.show(30)
    ram = core.ram
    arena_start = core.freeze()
    for pre_attack_frames in range(2000):
        if ram[0x14b1] == 255:
            break
        ram[0x1497] = 127
        core.run()
    else:
        raise ValueError('Bowser did not begin his Mechakoopa attack')
    files, registration = {}, {}
    boss = next(i for i in range(12) if ram[0x9e+i] == 0xa0 and ram[0x14c8+i] == 8)
    # Restoring WRAM does not restore the video callback's last framebuffer.
    # Prime the PPU in the requested direction before recording frame zero.
    core.restore(arena_start)
    primer = min(pre_attack_frames, 4)
    for _ in range(pre_attack_frames - primer):
        ram[0x1497] = 127
        core.run()
    begin = core.freeze()

    def frame():
        image, origin = car_pixels(core, boss)
        key = image, origin
        if key not in files:
            files[key] = save(f'bowser-action-{len(files)}.png', image)
            registration[files[key]] = {'plane': 'mode7', 'dx': origin[0], 'dy': origin[1]}
        return files[key]

    tracks = {}
    for suffix, direction in [('', 0), ('-right', 128)]:
        # Only Bowser's head turns. Preserve the car, propeller and rotated
        # recoil by recording both directions in the actual Mode 7 framebuffer.
        core.restore(begin)
        for _ in range(primer):
            ram[0x1497], ram[0x157c+boss] = 127, direction
            core.run()
        assert ram[0x14b1] == 255
        attack, release = [], None
        for _ in range(255):
            attack.append(frame())
            if ram[0x14b1] == 128:
                assert any(ram[0x9e+i] == 0xa2 and ram[0x14c8+i] == 8 for i in (0, 1))
                release = core.freeze()
            ram[0x157c+boss] = direction
            core.run()
        if release is None:
            raise ValueError('Bowser did not release a Mechakoopa')
        core.restore(release)
        x = ram[0xe4+boss] + 256*ram[0x14e0+boss]
        y = ram[0xd8+boss] + 256*ram[0x14d4+boss]
        ram[0x14c8] = 9  # stunned Mechakoopa, travelling upward into the head
        ram[0xaa], ram[0x15a0] = 0xe0, 0
        position(ram, 0, x-16, y-8)
        ram[0x157c+boss] = direction
        core.run()
        if ram[0x14b5] != 0x4c:
            raise ValueError('The Mechakoopa missed Bowser')
        hurt = []
        while ram[0x14b5]:
            hurt.append(frame())
            ram[0x157c+boss] = direction
            core.run()
        tracks['throw' + suffix], tracks['hurt' + suffix] = attack, hurt
    return tracks, registration
