"""Restore routes leading to each course and capture the native switch-palace launch."""
import json
from collections import deque
from pathlib import Path
from map_tiles import PPU


def route_graph():
    path = Path(__file__).resolve().parents[2]/'packages/core/data/world.json'
    return json.loads(path.read_text())


def prerequisites(graph):
    prior = {source:[] for source in graph['initial']}
    queue = deque(prior)
    while queue:
        source = queue.popleft()
        for kind,targets in graph['routes'][source].items():
            for target in targets:
                if target not in prior:
                    prior[target] = prior[source]+[source+':'+kind]
                    queue.append(target)
    return prior


def saved_course(core, freeze, node, completed, ids):
    core.restore(freeze)
    ram = core.ram
    ram[0x1f11] = node['region']
    for exit_id in completed:
        if exit_id in ids:
            event = ids[exit_id]
            ram[0x1f02+event//8] |= 128>>(event%8)
    ram[0x100] = 12
    core.run(200)
    if ram[0x100] != 14 or ram[0x1f11] != node['region']:
        raise ValueError('Could not load the event on its source map')
    return core.freeze()


def palace_wave(core, node, color, memory, art):
    ram = core.ram
    count = 40 if ram[0x1439]>=5 else ram[0x1436]
    colors = [bytes(((c&31)*255//31, ((c>>5)&31)*255//31, ((c>>10)&31)*255//31,255))
              for c in PPU.in_dll(core.lib,'PPU').cgram]
    attr = 0x30+(color-1)*2
    quads = [art.sprite(memory,colors,0xe6+(q//2)*16+q%2,attr) for q in range(4)]
    parts = []
    slots = sorted(range(count),key=lambda i:(ram[0x1438]//4+i)%40,reverse=True)
    for i in slots:
        def relative(low, high, base):
            return ((ram[low+i]+256*ram[high+i]-base+32768)&65535)-32768
        x = relative(0xb978,0xb900,node[1])-8
        y = relative(0xb9a0,0xb928,node[2])+relative(0xb9c8,0xb950,0)-8
        for q,sprite in enumerate(quads):
            if sprite is not None:
                parts.append((x+q%2*8,y+q//2*8,sprite))
    return art.groups.setdefault(tuple(parts),len(art.groups)) if parts else -1
