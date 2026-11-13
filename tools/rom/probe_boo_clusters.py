"""Compare active E1 cluster instances against extracted ring, slot and pose tables."""
import argparse
import json
from hashlib import sha256
from boss_pixels import oam
from pathlib import Path
from native_rooms import Core, cartridge_image, enter_room, first_course, write_word
from boo_clusters import read
from map_tiles import vram


def probe(core, rom, tables):
    base, r = first_course(core), core.ram
    tiles = read(rom, 0x02fbb3, 8)
    def pair(low, high, index=0):
        return r[low + index] + 256 * r[high + index]

    def offset(phase):
        return tables['radius'][phase & 255] * (-1 if phase & 256 else 1)

    for room, kind, x, direction in [('004',3,32,0), ('107',4,495,-1), ('0ed',4,784,1), ('0f8',7,450,0)]:
        enter_room(core,base,room)
        samples, active_frames, palettes, diving, angles = 0, 0, set(), set(), []
        for t in range(1000):
            write_word(r,0x94,min(x,48+2*t))
            write_word(r,0x96,204)
            r[0x7b] = r[0x7d] = 0
            r[0x1497] = 120
            core.run()
            slots = [i for i in range(20) if r[0x1892+i] == kind]
            if not slots or (kind == 4 and r[0x1e16+19] == r[0x1e3e+19] == 0): continue
            assert len(slots) == (10 if kind == 4 else 20)
            active_frames += 1
            frame = r[0x14]
            for slot in slots:
                idx = tables['slots'][slot]
                tile = r[0x202+idx*4]
                attr = r[0x203+idx*4]
                visible = r[0x201+idx*4] < 224
                if kind == 4:
                    angle = r[0xfae]+256*r[0xfb0]
                    if slot == slots[0]: angles.append(angle)
                    position = (angle + tables['ringAngles'][r[0xf72+slot]]) & 511
                    assert pair(0x1e16,0x1e3e,slot) == pair(0xfb2,0xfb4) + offset(position)
                    assert pair(0x1e02,0x1e2a,slot) == pair(0xfb6,0xfb8) + offset(position+128)
                if kind == 3 and r[0xf86+slot]: diving.add(slot)
                if kind == 7: palettes.add(r[0x190b])
                if not visible or (kind == 7 and r[0x190a] < 31): continue
                assert tile == tiles[(slot & 3)*2 + ((frame >> 3) & 1)], (kind, slot, frame, tile)
                assert attr >> 4 & 3 == 3
                samples += 1
            if kind == 4 and angles[-1] == (96*direction % 512):
                cx, cy = pair(0xfb2,0xfb4) - 128, pair(0xfb6,0xfb8) - 112
                data_ram = bytearray(r)  # Centre the native OBJ without modifying the emulated game.
                for slot in slots:
                    idx = tables['slots'][slot]
                    assert r[0x201+4*idx] < 224 and r[0x202+4*idx] == tiles[(slot & 3)*2+((frame>>3)&1)]
                    data_ram[0x200+4*idx] = pair(0x1e16,0x1e3e,slot) - cx
                    data_ram[0x201+4*idx] = pair(0x1e02,0x1e2a,slot) - cy
                    data_ram[0x420+idx] = 2
                _, _, data = oam(data_ram, vram(core), [bytes([255]*4)]*256, [tables['slots'][s] for s in slots])
                print('ring alpha',room, frame, sha256(data[3::4]).hexdigest())
            if active_frames >= 512: break
        assert active_frames == 512 and samples > 100, (room, active_frames, samples)
        if kind == 4:
            assert all(((b-a) & 511) == direction % 512 for a,b in zip(angles, angles[1:]))
        if kind == 3: assert len(diving) >= 10
        if kind == 7: assert palettes == set(range(9))
        print(room, '512 PAL frames,', samples, 'visible OBJ samples,', len(slots), 'instances;',
              'diving slots', len(diving), 'fog palette phases', len(palettes))


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    for name in ('core','rom','tables'): args.add_argument(name, type=Path)
    a = args.parse_args()
    image = cartridge_image(a.rom)
    core = Core(a.core.resolve(),image)
    try: probe(core,image,json.loads(a.tables.read_text()))
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
