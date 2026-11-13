"""Capture overworld player poses directly from the cartridge's OAM compositor."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'rom'))
from boss_pixels import oam, png, rgba_palette
from map_tiles import PPU, vram
from map_paths import word

CELL = 32
# SavedPlayerYoshi stores the reused sprite palette attribute.
MOUNTS = {'foot':0, 'yellow':4, 'blue':6, 'red':8, 'green':10}


def capture(core, saved, player, color, pose, phase):
    core.restore(saved)
    ram = core.ram
    ram[0xdd6] = player*4
    if player:
        ram[0x1f12] = ram[0x1f11]
        ram[0x1f1b:0x1f1f] = ram[0x1f17:0x1f1b]
    ram[0xdba+player] = color
    ram[0x1f13+2*player] = pose
    ram[0x13] = (phase*8-1)&255
    core.run()
    if ram[0x13] != phase*8 or ram[0x1f13+2*player] != pose:
        raise ValueError('Overworld logic changed the requested animation')
    width, _, pixels = oam(ram, vram(core), rgba_palette(PPU.in_dll(core.lib,'PPU')), range(39,47))
    center_x = (word(ram,0x1f17+4*player)-word(ram,0x1a))&65535
    center_y = (word(ram,0x1f19+4*player)-word(ram,0x1c))&65535
    x, y = center_x-16, center_y-24
    rows = [pixels[4*(width*(y+i)+x):4*(width*(y+i)+x+CELL)] for i in range(CELL)]
    sprite = b''.join(rows)
    if not any(sprite[3::4]) or sum(sprite[3::4]) != sum(pixels[3::4]):
        raise ValueError(f'Missing or clipped overworld pose {player}/{color}/{pose}/{phase}')
    return sprite


def generate(core, freeze, output):
    atlas, tracks = {}, {}
    for player, name in enumerate(('mario','luigi')):
        for mount,color in MOUNTS.items():
            poses = []
            for pose in range(0,24,2):
                frames = []
                for phase in range(4):
                    tile = capture(core,freeze,player,color,pose,phase)
                    frames.append(atlas.setdefault(tile,len(atlas)))
                poses.append(frames)
            tracks[name+'/'+mount] = poses
    columns = 16
    width, height = columns*CELL, ((len(atlas)+columns-1)//columns)*CELL
    pixels = bytearray(width*height*4)
    for tile,index in atlas.items():
        x, y = index%columns*CELL, index//columns*CELL
        for row in range(CELL):
            start = 4*((y+row)*width+x)
            pixels[start:start+4*CELL] = tile[row*4*CELL:(row+1)*4*CELL]
    (output/'players.png').write_bytes(png(width,height,pixels))
    (output/'players.json').write_text(json.dumps(tracks,separators=(',',':')))
