"""Read the main-screen BG1 pixels which cover low-priority overworld OBJ."""
from functools import lru_cache
import json
from map_events import restored_map
from map_tiles import MapTiles, vram


@lru_cache(maxsize=2048)
def rows(tile, flip):
    result = []
    for row in range(8):
        at = 2*(7-row if flip & 2 else row)
        bits = tile[at] | tile[at+1] | tile[at+16] | tile[at+17]
        result.append(int(f'{bits:08b}'[::-1], 2) if flip & 1 else bits)
    return tuple(result)


def mask_index(board, word, gfx, masks):
    at = (board.bases[1] + (word & 1023)*32) & 65535
    key = rows(gfx[at:at+32], word >> 14)
    return masks.setdefault(key,len(masks))


def read_masks(core, freeze, output):
    events = json.loads((output/'events.json').read_text())
    masks, tracks = {(0,)*8: 0}, {}
    regions = []
    for r in range(7):
        memory = restored_map(core,freeze,r,None)
        board = MapTiles(core,r)
        if core.ram[0xd9d:0xd9f] != [0x15,0x02]:
            raise ValueError('Overworld BG1 and OBJ should share the main screen, BG2 the subscreen')
        while core.ram[0x13] % 128:
            core.run()
        cycle = []
        for _ in range(128):
            cycle.append(vram(core)[:0x4000])
            core.run()

        @lru_cache(maxsize=None)
        def track(word):
            phases = tuple(mask_index(board,word,gfx,masks) for gfx in cycle)
            if len(set(phases)) == 1:
                phases = phases[:1]
            return tracks.setdefault(phases,len(tracks))

        cols = board.width//8
        base = [track(board.words(memory,(addr,))[0]) for _,_,_,addr in board.cells]
        region = {'cols':cols, 'base':base, 'events':{}}
        for event,areas in events['patches'].items():
            if str(r) not in areas:
                continue
            changed = restored_map(core,freeze,r,int(event))
            updates = []
            for i,(x,y,_) in enumerate(areas[str(r)]):
                cell = y//8*cols + x//8
                addr = board.cells[cell][3]
                index = track(board.words(changed,(addr,))[0])
                updates.append([cell,i,index])
            region['events'][event] = updates
        regions.append(region)
    return {'masks':list(masks), 'tracks':list(tracks), 'regions':regions}
