"""Compare both Koopa facings in Snes9x with the web atlas, pixel for pixel."""
import argparse
import json
import struct
import zlib
from pathlib import Path
from native_rooms import Core, cartridge_image
from probe_shell_contacts import flat_room, position, spawn
from boss_pixels import oam
from map_tiles import vram
from npc_pose_cases import check_states


class Atlas:
    """Read unfiltered RGBA8 PNGs as emitted by tools/rom/png.mjs."""
    def __init__(self, folder):
        self.frames = json.loads((folder/'creatures.json').read_text())['frames']
        data = (folder/'creatures.png').read_bytes()
        self.width, height = struct.unpack('>II', data[16:24])
        chunks = bytearray()
        offset = 8
        while offset < len(data):
            size = int.from_bytes(data[offset:offset+4], 'big')
            if data[offset+4:offset+8] == b'IDAT':
                chunks.extend(data[offset+8:offset+8+size])
            offset += size + 12
        rows = zlib.decompress(chunks)
        stride = self.width * 4 + 1
        assert not any(rows[::stride]) and len(rows) == stride * height
        self.pixels = b''.join(rows[start+1:start+stride] for start in range(0, len(rows), stride))

    def get(self, key):
        rect = self.frames[key]['frame']
        x, y, w, h = (rect[k] for k in ('x', 'y', 'w', 'h'))
        return (w, h, b''.join(self.pixels[4*((y+j)*self.width+x):4*((y+j)*self.width+x+w)] for j in range(h)))


def native_crop(r, memory, colors):
    slot = 64 + r[0x15ea]//4
    entries = [i for i in range(slot, min(128, slot+4)) if r[0x201+4*i] < 224]
    width, _, pixels = oam(r, memory, colors, entries)
    xs = [r[0x200+4*i] for i in entries]
    ys = [r[0x201+4*i] for i in entries]
    x0 = min(xs); y0 = min(ys)
    x1 = min(256, max(xs)+16); y1 = min(224, max(ys)+16)
    opaque = [(x,y) for y in range(y0,y1) for x in range(x0,x1) if pixels[4*(y*width+x)+3]]
    x0 = min(x for x,y in opaque); y0 = min(y for x,y in opaque)
    x1 = max(x for x,y in opaque)+1; y1 = max(y for x,y in opaque)+1
    cropped = b''.join(pixels[4*(j*width+x0):4*(j*width+x1)] for j in range(y0,y1))
    return x1-x0, y1-y0, cropped


def reflect(image):
    width,height,data = image
    return width,height,b''.join(data[4*(width*y+x):4*(width*y+x+1)]
                                 for y in range(height) for x in reversed(range(width)))


def check(library, path, folder, previous):
    rom = cartridge_image(path)
    core = Core(library, rom)
    atlas = Atlas(folder)
    campaign = json.loads((folder/'content.json').read_text())
    before = Atlas(previous) if previous else None
    flat = flat_room(core)
    memory = vram(core)
    total = opaque = backwards = turns = folded = 0
    previous_mismatch = set()
    try:
        for number in range(13):
            room = next(room for room in campaign['levels'].values()
                        if any(s['spriteId'] == number for s in room['sprites']))
            tileset = room['spriteTileset']
            # The common Koopa OBJ pages are also loaded by Yoshi's Island 1.
            # Use the palette of the room in which the extractor captured this pair.
            colors = [v.to_bytes(3,'big') + b'\xff' for v in room['spritePalette']]
            for right in [False, True]:
                core.restore(flat)
                r = core.ram
                spawn(r, rom, 0, number, 120)
                # The normal level loader copies the OAM palette from sprite property C.
                r[0x15f6] = rom[0x3f3fe + number] & 0xf
                core.run()
                # Supply a known animation phase, then let the PAL scheduler
                # draw it. Movement can still trigger a turn or folded wings.
                r[0x15ac] = 0
                for sample in range(32):
                    position(r, 0, 120)
                    r[0x9d] = 1
                    r[0x1570] = sample
                    r[0x1602] = (sample >> 3) & 1
                    r[0x157c] = int(not right)
                    r[0x1588] = 0
                    core.run()
                    phase = r[0x1570] & 31
                    face = r[0x157c] == 0
                    key = f'{tileset}-{number}' + (':right' if face else '') + f'/{phase}'
                    if r[0x15ac]:
                        drawn_right = face != (r[0x15ac] >= 5)
                        key = f'{tileset}:turn{number}/{int(drawn_right)}'
                        turns += 1
                    elif number >= 8 and r[0x1588] & 4:
                        key = f'{tileset}:wingGround{number}/{2*(r[0x1602]&1) + int(face)}'
                        folded += 1
                    actual = native_crop(r, memory, colors)
                    expected = atlas.get(key)
                    assert actual == expected, (key, actual[:2], expected[:2])
                    if before:
                        prior = before.get(f'{tileset}-{number}/{phase}')
                        old = reflect(prior) if right else prior
                        if old != actual:
                            previous_mismatch.add(number)
                        if reflect(old) == actual and old != actual:
                            backwards += 1
                    opaque += sum(bool(a) for a in expected[2][3::4])
                    total += 1
        print(f'{total} left/right Koopa poses from Snes9x, {opaque} opaque pixels match the generated atlas.')
        print(f'Includes {turns} frames turning and {folded} with folded wings on the ground.')
        if before:
            print('Prior build', backwards, 'exactly mirrored frames. Mismatched sprite IDs',
                  ', '.join(f'${id:02x}' for id in sorted(previous_mismatch)))
        check_states(core, rom, flat, campaign, atlas)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('core','rom','generated'):
        parser.add_argument(name,type=Path)
    parser.add_argument('--previous',type=Path,help='Optional directory containing the pre-fix atlas')
    args = parser.parse_args()
    check(args.core,args.rom,args.generated,args.previous)
