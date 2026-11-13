"""Trace the ambient overworld sprites, their map cameras and fish triggers in PAL E1."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'rom'))
from map_obj_tiles import Tiles
from map_obj_mask import read_masks
from map_paths import KEYS, opened_map, place_player, tile_index, word


def signed(value):
    return (value + 32768) % 65536 - 32768


def axis(ram, slot, n):
    i = slot + 16*n
    return signed(ram[0xe35+i] + 256*ram[0xe65+i])


def cycle(samples):
    # Compare the entire suffix; require two complete native periods.
    n = len(samples)
    for length in range(1, n//2+1):
        if samples[-length:] != samples[-2*length:-length]:
            continue
        start = next((i+1 for i in range(n-length-1,-1,-1) if samples[i] != samples[i+length]), 0)
        if start <= 256 and start + max(256, 2*length) <= n:
            return {'start': start, 'frames': samples[:start+length]}
    raise ValueError('Native decoration did not complete a repeat in the observation window')


def screen_parts(r, slots, tiles):
    result = []
    for i in slots:
        x, y, char, flags = r[0x200+4*i:0x204+4*i]
        if y >= 224:
            continue
        size = r[0x420+i]
        result.append([signed(x - 256*(size&1) + word(r,0x1a)), signed(y + word(r,0x1c)),
                       tiles.add(char, flags, 16 if size&2 else 8), i])
    return result


def steady(core, saved, region, tiles):
    r = core.ram
    place = (104,106) if region == 1 else (368,50) if region == 4 else (56,394)
    core.restore(saved)
    place_player(r, (region,*place))
    core.run(32)
    if region == 0:
        # Isolate the four smoke tiles from the three camera-dependent clouds.
        r[0xde5:0xde8] = [8,8,8]
    keys = ([13,14,15,6] if region == 0 else [6] if region == 1 else [8,9])
    tracks = {i: [] for i in keys}
    for _ in range(4096):
        core.run()
        for i in keys:
            if i >= 13 or i == 9:
                # These sprites move even outside the camera. FE62 projects
                # (X,Y-Z). The object routines choose their tile and X flip.
                base = 0x202 + 4*(i+58)
                tile = tiles.add(r[base],r[base+1],16)
                part = [[axis(r,i,0), axis(r,i,1)-r[0xe55+i], tile, i+58]]
            elif i == 6:
                part = screen_parts(r, range(28,32), tiles)
            else:
                part = screen_parts(r, range(62,67), tiles)
            tracks[i].append(part)
    result = {}
    for i,frames in tracks.items():
        try:
            result[i] = cycle(frames)
        except ValueError as exc:
            raise ValueError(f'Non-repeating OW sprite {i} in region {region}, first/last: {frames[0]} {frames[-1]}') from exc
    return result


def fish_routes(core, saved, paths, tiles):
    core.restore(saved)
    r = core.ram
    triggers = {(x,y) for x in range(0,512,16) for y in range(0,512,16)
                if 0x4e <= r[0xc800+tile_index((0,x,y))] <= 0x50}
    routes = {}
    for source, stop in paths.items():
        for command, edge in stop['directions'].items():
            if not any(reg == 0 and (x&~15,y&~15) in triggers for _,reg,x,y in edge['path']):
                continue
            core.restore(saved)
            place_player(r,stop['position'])
            core.run(2)
            frames, start, last_trigger = [], None, None
            for t in range(1,edge['frames']+100):
                core.run(1, KEYS[command] if t==1 else 0)
                if 0x4e <= r[0x13c1] <= 0x50:
                    last_trigger = t
                if r[0xdf5+12]:
                    if start is None:
                        start = t
                    frames.append(screen_parts(r,range(68,71),tiles))
                elif start is not None:
                    break
            if start is not None:
                routes[source+'/'+command] = {'start':start, 'until':last_trigger+1, 'frames':frames}
    return routes


def generate(core, freeze, paths, output):
    regions = {region: opened_map(core, freeze, region) for region in (0,1,4)}
    core.restore(regions[0])
    tiles = Tiles(core)
    tracks = []
    for region in (0,1,4):
        for slot,track in steady(core, regions[region], region, tiles).items():
            extra = {13: [2,48,32], 14: [4,256,-144], 15: [3,-240,16]}
            positions = [[region,0,0], extra[slot]] if slot in extra else [[region,0,0]]
            for dest,dx,dy in positions:
                tracks.append({'region':dest, 'slot':slot, 'offset':[dx,dy], 'track':track})
    fish = fish_routes(core,regions[0],paths,tiles)
    clouds = [tiles.add(0x44,attr,16) for attr in (0x32,0x72)]
    # The fish flips on the spawn frame parity, changes character on TrueFrame,
    # then flips about both axes after its Z speed changes sign.
    fish_art = [[[tiles.add(char, (0x12|flip) ^ inversion, 16) for char in (0x4a,0x48)]
                 for flip in (0,64)] for inversion in (0,0xc0)]
    tiles.write(output/'decorations.png')
    atlas = {'actors':tracks, 'fish':fish, 'fishArt':fish_art, 'clouds':clouds,
             'priorities':tiles.priorities, 'occlusion':read_masks(core,freeze,output)}
    (output/'decorations.json').write_text(json.dumps(atlas,separators=(',',':')))
    print('OW actors', [(t['region'],t['slot'],t['track']['start'],len(t['track']['frames'])) for t in tracks],
          'fish (edge, trigger start/end, duration)', [(k,t['start'],t['until'],len(t['frames'])) for k,t in fish.items()], 'unique OBJ tiles', len(tiles.image))


if __name__ == '__main__':
    from native_rooms import Core, cartridge_image
    core_file, rom_file, output = map(Path,sys.argv[1:])
    c = Core(core_file,cartridge_image(rom_file))
    try:
        c.run(400)
        for key in (8,256,256):
            c.run(2,key); c.run(60)
        c.run(500)
        for _ in range(20):
            c.run(3,8); c.run(80)
            if c.ram[256] == 14: break
        if c.ram[256] != 14: raise ValueError('Expected the overworld')
        generate(c,c.freeze(),json.loads((output/'paths.json').read_text()),output)
    finally:
        c.lib.retro_unload_game(); c.lib.retro_deinit()
