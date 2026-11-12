"""Rebuild each exit's overworld event in SMW's original save restoration code."""
import json
from map_tiles import paste, png, vram


def restored_map(core, freeze, group, event):
    core.restore(freeze)
    # GM0CLoadOverworld -> CopyFromSaveBuffer -> DecompressOverworldL2.
    core.ram[0x1fb8] = group
    core.ram[0x1fd5] = 1
    core.ram[0x13c9] = 1
    if event is not None:
        core.ram[0x1fa9 + event//8] |= 0x80 >> (event%8)
    core.ram[0x100] = 12
    core.run(90)
    if core.ram[0x100] != 14:
        raise RuntimeError('overworld event load did not complete')
    return vram(core)


def generate(core, freeze, image, maps, nodes, output):
    ids = {}
    for course in nodes:
        room = int(course,16)
        translevel = room if room < 0x100 else room-0x100+0x24
        event = image[0x2d608+translevel]
        if event == 255:
            continue
        ids[course+':normal'] = event
        ids[course+':secret'] = event+1
    patches = {}
    atlas = {}
    for group in (0,1):
        before = restored_map(core,freeze,group,None)
        for event in sorted(set(ids.values())):
            after = restored_map(core,freeze,group,event)
            if before[0x4000:0x8000] == after[0x4000:0x8000]:
                continue
            for region in ([0] if group==0 else range(1,7)):
                board = maps[region]
                positions = []
                for x,y,bg2,bg1 in board.cells:
                    if all(before[a:a+2]==after[a:a+2] for a in (bg1,bg2)):
                        continue
                    tile = board.tile(after,(bg2,bg1))
                    if tile != board.tile(before,(bg2,bg1)):
                        index = atlas.setdefault(tile,len(atlas))
                        positions.append([x,y,index])
                if positions:
                    patches.setdefault(event,{})[region] = positions
    if not atlas:
        raise RuntimeError('the cartridge did not render any overworld events')
    width = 256
    height = ((len(atlas)+31)//32)*8
    pixels = bytearray(width*height*3)
    for tile,index in atlas.items():
        paste(pixels,width,index%32*8,index//32*8,tile)
    (output/'events.png').write_bytes(png(width,height,pixels))
    (output/'events.json').write_text(json.dumps({'ids':ids,'patches':patches},separators=(',',':')))
