"""Trace event path uploads, flashes and structure animations one PAL frame at a time."""
import json
from map_paths import global_position, place_player, word
from map_tiles import vram
from map_event_context import route_graph, prerequisites, saved_course, palace_wave
from map_reveal_art import RevealArt, effect_bounds, rom_word
from map_reveal_surface import RoadStep, center_camera, surface


def trace(core, saved, image, node, room, event, patches, board, final_words, art):
    core.restore(saved)
    ram = core.ram
    place_player(ram,global_position(node))
    core.run(80)
    source = global_position(node)
    ram[0xdae] = 15  # full screen brightness for the reference framebuffer
    ram[0x13bf] = room if room < 0x100 else room-0x100+0x24
    ram[0x1f02+event//8] &= ~(128>>(event%8))
    ram[0x1de9] = 1  # first clear, permitting the event to run
    ram[0xdd5] = 1
    ram[0x1dea] = event
    ram[0x1b86] = 0
    palace_levels = image[0x2a590:0x2a594]
    if ram[0x13bf] in palace_levels:
        ram[0x13d2] = 1 + palace_levels.index(ram[0x13bf])
        ram[0x1436:0x143a] = bytes(4)
    ram[0x13d9] = 1  # start bank 04's native event dispatcher
    addresses = {(x,y):(a,b) for x,y,a,b in board.cells}
    positions = {a:(x,y) for x,y,a,_ in board.cells}
    checks = [(addresses[(x,y)],final_words[i]) for x,y,i in patches]
    reached = [None]*len(checks)
    fx, settled = [], []
    road = None
    for frame in range(3000):
        wave = ram[0x13d2]
        stage = ram[0x1b86]
        origin, slots = effect_bounds(image,ram,node['region'],event,stage)
        if stage in (3,4):
            entry = word(ram,0x1deb)*4
            dest = rom_word(image,0x04dd8f+entry)
            origin = positions.get(0x6000+(dest&0x1fff))
            grid = 2 if rom_word(image,0x04dd8d+entry) >= 0x900 else 6
        if origin is not None:
            center_camera(ram,node['region'],origin)
        core.run()
        memory = vram(core)
        for i,(pair,words) in enumerate(checks):
            if board.words(memory,pair) != words:
                reached[i] = None
            elif reached[i] is None:
                reached[i] = frame
        if wave:
            group = palace_wave(core,source,wave,memory,art) if ram[0x13d2] else -1
            art.place(fx,frame,(node['x'],node['y']),group)
        elif stage == 3 and origin is not None:
            road = RoadStep(origin,grid,surface(core.frame,grid*8))
        elif stage == 4 and road is not None:
            road.add(frame,surface(core.frame,grid*8))
            if ram[0x1b86] != 4:
                road.finish(art,fx,settled,frame)
                road = None
        else:
            group = art.capture(core,memory,origin,slots)
            art.place(fx,frame,origin,group)
        if ram[0x13d9] != 1:
            break
    else:
        raise RuntimeError(f'Event {event} did not finish from level {room:03x}')
    # Remote map edits applied only by save restoration become visible at completion.
    return {'duration':frame+1,'region':node['region'],'cells':[frame if t is None else t for t in reached], 'fx':fx, 'settled':settled}


def generate(core, freeze, image, boards, nodes, event_words, output):
    events = json.loads((output/'events.json').read_text())
    final_words = {index:words for (_,words),index in event_words.items()}
    graph = route_graph()
    prior = prerequisites(graph)
    states = {}
    core.capture_video = True
    art = RevealArt()
    clips = {}
    for exit_id,event in events['ids'].items():
        course, kind = exit_id.split(':')
        if course not in graph['names'] or (kind == 'secret' and kind not in graph['routes'][course]):
            continue
        node = nodes[course]
        region = node['region']
        patches = events['patches'].get(str(event),{}).get(str(region),[])
        if course not in states:
            states[course] = saved_course(core,freeze,node,prior.get(course,[]),events['ids'])
        clip = trace(core,states[course],image,node,int(course,16),event,patches,boards[region],final_words,art)
        if patches or any(f[-1]>=0 for f in clip['fx']):
            clips[exit_id] = clip
    core.capture_video = False
    art.write(output)
    (output/'reveal.json').write_text(json.dumps({'clips':clips,'groups':list(art.groups)},separators=(',',':')))
