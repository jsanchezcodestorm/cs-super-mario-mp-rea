"""Decode the two original overworld tile layers and place each course on its map."""
import json
from core import Core
from map_tiles import MapTiles
from map_reveals import generate as generate_reveals
from map_animation import generate as generate_animation
from map_players import generate as generate_players
from map_decorations import generate as generate_decorations
from map_events import generate as generate_events
from map_paths import generate as generate_paths

def generate(library,image,output):
    core=Core(library,image)
    core.run(400)
    for key in (8,256,256):
        core.run(2,key);core.run(60)
    core.run(500)
    for _ in range(20):
        core.run(3,8);core.run(80)
        if core.ram[0x100]==14:break
    if core.ram[256]!=14:raise RuntimeError('overworld initialization failed')
    freeze=core.freeze()
    nodes={}
    for i,translevel in enumerate(core.ram[0xd000:0xd800]):
        if not translevel:continue
        room=translevel if translevel<=0x24 else 0x100+translevel-0x24
        x=((i&15)+((i>>8)&1)*16)*16+8
        y=(((i>>4)&15)+((i>>9)&1)*16)*16+8
        region=0 if i<1024 else 1+min(y//168,2)+(3 if x>=256 else 0)
        nodes[f'{room:03x}']={'region':region,'x':x-(256 if region>=4 else 0),'y':y-[0,0,160,336,0,160,336][region]}
    output.mkdir(parents=True,exist_ok=True)
    generate_players(core,freeze,output)
    maps = []
    for region in range(7):
        core.restore(freeze)
        core.ram[0x1f11]=region
        core.ram[256]=12
        core.run(200)
        if core.ram[256]!=14:raise RuntimeError(f'failed to load region {region}')
        maps.append(MapTiles(core,region))
        (output/f'{region}.png').write_bytes(maps[-1].image())
    event_words = generate_events(core,freeze,image,maps,nodes,output)
    generate_animation(core,freeze,maps,event_words,output)
    generate_reveals(core,freeze,image,maps,nodes,event_words,output)
    paths = generate_paths(core, freeze, nodes, output / 'paths.json')
    generate_decorations(core, freeze, paths, output)
    (output/'nodes.json').write_text(json.dumps(nodes))
    (output/'regions.json').write_text(json.dumps({k:v['region'] for k,v in nodes.items()}))
    core.lib.retro_unload_game();core.lib.retro_deinit()
    return nodes, paths
