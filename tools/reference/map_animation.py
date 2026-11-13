"""Sample the actual Mode 1 character and palette uploads used by the overworld."""
import json
from map_tiles import PPU, paste, png, vram


def captures(core, freeze, region):
    core.restore(freeze)
    core.ram[0x1f11] = region
    core.ram[0x100] = 12
    core.run(200)
    period = 1024 if region == 4 else 128
    if region == 4:
        # Let the native lightning wait/flash counters settle into their recurring sequence.
        core.run(4096)
    while core.ram[0x13] % 128:
        core.run()
    ppu = PPU.in_dll(core.lib, 'PPU')
    unique, frames = {}, []
    for frame in range(period + 1):
        gfx, colors = vram(core)[:0x4000], bytes(ppu.cgram)[:256]
        phase = unique.setdefault((gfx,colors),len(unique))
        if frame == period:
            if phase != frames[0]:
                raise ValueError(f'Overworld palette/character cycle failed to close in region {region}')
            break
        frames.append(phase)
        core.run()
    samples = []
    for gfx,raw in unique:
        colors = [int.from_bytes(raw[i:i+2],'little') for i in range(0,256,2)]
        palette = tuple(bytes(((c&31)*255//31, ((c>>5)&31)*255//31, ((c>>10)&31)*255//31)) for c in colors)
        samples.append((gfx,palette))
    return frames, samples


def tile_track(board, words, samples, atlas):
    starts = [(base+(word&1023)*32)&65535 for base,word in zip(board.bases,words)]
    rows = [((word>>10)&7)*16 for word in words]
    cache, track = {}, []
    for gfx,palette in samples:
        signature = tuple(gfx[start:start+32] for start in starts) + tuple(palette[row:row+16] for row in rows) + (palette[0],)
        if signature not in cache:
            cache[signature] = board.raster(words,gfx,palette)
        track.append(cache[signature])
    if len(set(track)) == 1:
        return None
    return tuple(atlas.setdefault(tile,len(atlas)) for tile in track)


def generate(core, freeze, maps, event_words, output):
    atlas, regions = {}, []
    for region,board in enumerate(maps):
        phases, samples = captures(core,freeze,region)
        cells = {(x,y): board.words(board.gfx,addresses) for x,y,*addresses in board.cells}
        patches = {index:words for (r,words),index in event_words.items() if r==region}
        tracks, indices = {}, {}
        for words in sorted(set(cells.values()) | set(patches.values())):
            track = tile_track(board,words,samples,atlas)
            if track:
                indices[words] = tracks.setdefault(track,len(tracks))
        regions.append({'phases':phases,'tracks':list(tracks),
                        'tiles':[[x,y,indices[w]] for (x,y),w in cells.items() if w in indices],
                        'events':{i:indices[w] for i,w in patches.items() if w in indices}})
    width, height = 256, ((len(atlas)+31)//32)*8
    pixels = bytearray(width*height*3)
    for tile,index in atlas.items():
        paste(pixels,width,index%32*8,index//32*8,tile)
    (output/'animation.png').write_bytes(png(width,height,pixels))
    (output/'animation.json').write_text(json.dumps(regions,separators=(',',':')))
