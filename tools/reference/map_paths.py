"""Trace overworld walks and transport tiles with Snes9x and the PAL E1 cartridge."""
from collections import deque
import json

# Key masks passed to the libretro joypad.
KEYS = {'left': 64, 'right': 128, 'up': 16, 'down': 32, 'action': 256}
TRANSPORT_TILES = {0x5b, 0x5f, 0x82}
EXIT_DIRECTIONS = ('up', 'down', 'left', 'right')
MAP_MODE = 14
WAITING_FOR_INPUT = 3


def word(ram, address):
    return ram[address] | ram[address + 1] << 8


def set_word(ram, address, value):
    ram[address] = value & 255
    ram[address + 1] = value >> 8


def tile_index(position):
    region, x, y = position
    return (1024 if region else 0) + (x // 16 & 15) + (y // 16 & 15) * 16 + (x // 256) * 256 + (y // 256) * 512


def global_position(node):
    region = node['region']
    return region, node['x'] + (256 if region >= 4 else 0), node['y'] + [0, 0, 160, 336, 0, 160, 336][region]


def player_position(ram):
    # During a star launch the sprite can rise above the top of the map.
    x, y = word(ram, 0x1f17), word(ram, 0x1f19)
    return ram[0x1f11], x - 65536 if x >= 32768 else x, y - 65536 if y >= 32768 else y


def opened_map(core, initial, region):
    """Use the game's save restoration to reveal every path in this diagnostic."""
    core.restore(initial)
    ram = core.ram
    for i in range(15):
        ram[0x1fa9 + i] = 0xff  # saved event bits, restored into $1F02
    ram[0x1fb8] = region
    ram[0x1fd5] = 1
    ram[0x13c9] = 1
    ram[0x100] = 12
    core.run(140)
    if ram[0x100] != MAP_MODE:
        raise RuntimeError(f'PAL overworld did not initialize submap {region}')
    for i in range(96):
        ram[0x1ea2 + i] |= 15  # let each direction reach the native path validation
    return core.freeze()


def idle_pose(tile):
    # E1 bank 04 marks these overworld cells as water and selects the facing-down pose.
    return 10 if tile == 0x80 or 0x6a <= tile <= 0x6d else 2


def place_player(ram, source):
    region, x, y = source
    ram[0x1f11] = region
    for address, value in ((0x1f17, x), (0x1f19, y), (0x1f1f, x // 16), (0x1f21, y // 16)):
        set_word(ram, address, value)
    ram[0x13c1] = ram[0xc800 + tile_index(source)]
    ram[0x1f13] = idle_pose(ram[0x13c1])
    ram[0x13d9] = WAITING_FOR_INPUT
    ram[0x0dd5] = 0  # disable automatic movement after an exit
    ram[0x0ef7] = 0
    ram[0x13c9] = 0  # close the synthetic save restoration prompt
    ram[0x1b87] = 0


def trace(core, saved, source, button):
    core.restore(saved)
    ram = core.ram
    place_player(ram, source)
    core.run(2)
    samples = [[0, *source]]
    poses = [[0, ram[0x1f13]]]
    core.run(1, KEYS[button])
    for frame in range(2, 1202):
        core.run(1)
        position = player_position(ram)
        # -1 is the four-direction star spin. -2 hides the actor during a map reload.
        pose = -2 if ram[0x100] != MAP_MODE else -1 if ram[0x13d9] == 0x0b else ram[0x1f13]
        if pose != poses[-1][1]:
            poses.append([frame, pose])
        if ram[0x100] != MAP_MODE:
            if button != 'action':
                raise RuntimeError(f'unexpected mode during walk from {source}')
            continue  # pipes reload the overworld through modes 0B .. 0D
        finished = frame >= 6 and ram[0x13d9] == WAITING_FOR_INPUT
        if finished and position == source:
            return None
        if (frame % 8 == 0 and tuple(samples[-1][1:]) != position) or finished:
            samples.append([frame, *position])
        if finished:
            core.run(20)  # allow the native face-direction timer to settle
            return position, frame, samples, poses, ram[0x1f13]
    raise RuntimeError(f'overworld input {button} at {source} never settled')


def generate(core, initial, nodes, output):
    """Each sample is [PAL frame, native submap, global overworld X, global overworld Y]."""
    names = {global_position(node): name for name, node in nodes.items()}
    pending = deque(names)
    states = {region: opened_map(core, initial, region) for region in sorted({p[0] for p in names})}
    result = {}
    pose_paths, idle = {}, {}

    def label(position):
        return names.get(position, 'ow-%d-%d-%d' % position)

    while pending:
        source = pending.popleft()
        name = label(source)
        if name in result:
            continue
        saved = states[source[0]]
        core.restore(saved)
        index = tile_index(source)
        tile = core.ram[0xc800 + index]
        # Bank 04 reads OWLayer2Directions before it starts the auto-walk.
        # The normal exit uses bits 7..6, and the second exit uses bits 5..4.
        packed = core.ram[0xd800 + index]
        exits = {'normal': EXIT_DIRECTIONS[packed >> 6], 'secret': EXIT_DIRECTIONS[(packed >> 4) & 3]}
        directions = {}
        for button in KEYS:
            if button == 'action' and tile not in TRANSPORT_TILES:
                continue
            journey = trace(core, saved, source, button)
            if journey:
                target, frames, path, poses, resting = journey
                pose_paths.setdefault(name,{})[button] = poses
                idle[label(target)] = resting
                directions[button] = {'to': label(target), 'frames': frames, 'path': path}
                pending.append(target)
        result[name] = {'position': list(source), 'tile': tile, 'directions': directions, 'exitDirections': exits}
    for stop,data in result.items():
        if stop not in idle:
            idle[stop] = idle_pose(data['tile'])
    output.with_name('poses.json').write_text(json.dumps({'idle':idle,'paths':pose_paths},separators=(',',':')))
    output.write_text(json.dumps(result, separators=(',', ':')))
    return result
