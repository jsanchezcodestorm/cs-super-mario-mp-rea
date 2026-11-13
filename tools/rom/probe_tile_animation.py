"""Compare exported animation frames with independent Snes9x VRAM and CGRAM reads."""
import argparse
import functools
import json
import struct
import zlib
from pathlib import Path
from native_rooms import Core, cartridge_image, enter_room, first_course, read_word
from map_tiles import PPU, vram


def atlas_rows(path):
    data = path.read_bytes()
    width = struct.unpack_from('>I',data,16)[0]
    i, compressed = 8, []
    while i < len(data):
        length, kind = struct.unpack_from('>I4s',data,i)
        if kind == b'IDAT':
            compressed.append(data[i+8:i+8+length])
        i += length+12
    raw = zlib.decompress(b''.join(compressed))
    stride = width*4+1
    if any(raw[::stride]):
        raise ValueError('Expected the unfiltered RGBA tilesheet written by tools/rom/png.mjs')
    return [raw[i+1:i+stride] for i in range(0,len(raw),stride)]


def indices(gfx, word):
    for y in range(8):
        offset = (word&1023)*32 + (7-y if word&32768 else y)*2
        planes = [gfx[offset+i] for i in (0,1,16,17)]
        for x in range(8):
            bit = x if word&16384 else 7-x
            yield sum(((plane >> bit)&1)<<i for i,plane in enumerate(planes))


def compare(core, image, base, room, directory, switched=False):
    enter_room(core,base,room['id'])
    ceiling = any(sprite['spriteId'] == 0xf2 for sprite in room['sprites'])
    def step():
        if switched:
            # Isolate the graphics upload from the ceiling controller which resets $14AF.
            if ceiling:
                core.ram[0x143f] = 0
            core.ram[0x14af] = 1
        core.run()
    for _ in range(40):
        step()
    rows = atlas_rows(directory/room['atlas'])
    tracks = room['animatedTiles']
    tiles = set(room['tiles']) | set(room.get('background',{}).get('tiles',[]))
    words = {}
    for tile in tiles:
        key = str(tile+1024) if switched else str(tile)
        if key not in tracks:
            continue
        ptr = read_word(core.ram,0xfbe+tile*2) if tile < 512 else 0x9100+(tile-512)*8
        words[tile] = struct.unpack_from('<4H',image,0x68000+(ptr&32767))
    ppu = PPU.in_dll(core.lib,'PPU')

    @functools.lru_cache(maxsize=128)
    def rgba(color):
        return bytes(((v<<3)+(v>>2) for v in (color&31,(color>>5)&31,(color>>10)&31))) + bytes([255])

    for _ in range(32):
        step()
        frame, gfx = core.ram[0x14]&31, vram(core)
        for tile,descriptors in words.items():
            index = tracks[str(tile+1024 if switched else tile)][frame]
            for q,word in enumerate(descriptors):
                x, y = index%32*16 + q//2*8, index//32*16 + q%2*8
                colors = [bytes(4)] + [rgba(ppu.cgram[((word>>10)&7)*16+c]) for c in range(1,16)]
                actual = b''.join(colors[i] for i in indices(gfx,word))
                exported = b''.join(row[4*x:4*x+32] for row in rows[y:y+8])
                if actual != exported:
                    raise AssertionError(f"{room['id']} Map16 {tile:03X}, quadrant {q}, PAL frame {frame}")
    return len(words)*32


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core',type=Path)
    parser.add_argument('rom',type=Path)
    parser.add_argument('manifest',type=Path)
    parser.add_argument('rooms',nargs='*',default=['105','106','109'])
    parser.add_argument('--off',action='store_true',help='Compare character uploads controlled by the OFF switch state')
    parser.add_argument('--all-atlases',action='store_true',help='Enter one regular room for each reachable Map16 atlas')
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    rooms = json.loads(args.manifest.read_text())['levels']
    core = Core(args.core,image)
    try:
        base = first_course(core)
        selected = args.rooms
        if args.all_atlases:
            atlas_rooms = {}
            for room in rooms.values():
                if len(room['id']) == 3 and not room['specialMode7']:
                    atlas_rooms.setdefault(room['atlas'],room['id'])
            selected = list(atlas_rooms.values())
        total = 0
        for room in selected:
            count = compare(core,image,base,rooms[room],args.manifest.parent,args.off)
            total += count
            print(f'{room}: {count} Map16 frames match Snes9x VRAM and CGRAM',flush=True)
        print(f'{total} Map16 frames across {len(selected)} rooms')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
