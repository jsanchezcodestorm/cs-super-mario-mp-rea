"""Capture consecutive PAL boss poses, separately for every live OAM instance."""
from boss_pixels import mode7, oam, rgba_palette, trim
from map_tiles import PPU, vram


def poses(core, name):
    memory = vram(core)
    colors = rgba_palette(PPU.in_dll(core.lib, 'PPU'))
    if name not in ('iggy', 'larry', 'reznor', 'lemmy', 'wendy'):
        w, h = (64, 96) if name == 'bowser' else (32, 32)
        yield 'main', trim(mode7(memory, colors, 30, 34, w, h)), {'plane': 'mode7'}
        return

    ram = core.ram
    sprite = 0xa9 if name == 'reznor' else 0x29
    for slot in range(12):
        if ram[0x14c8+slot] != 8 or ram[0x9e+slot] != sprite:
            continue
        first = 64 + ram[0x15ea+slot] // 4
        if name == 'reznor':
            # Four body tiles precede the two platform tiles for each load index.
            first -= 4
            count = 6
            track = 'wheel' + str(ram[0x161a+slot])
        elif name in ('lemmy', 'wendy'):
            count = 6
            offset = ram[0x1570+slot] // 8
            track = 'decoy' + str(offset) if offset else 'main'
        else:
            track, count = 'main', 4
        owner = {}
        yield track, trim(oam(ram, memory, colors, range(first, first+count), owner, center=True)), owner


def period(frames):
    """Compact a cycle only when at least two complete copies were observed."""
    for length in range(1, len(frames)//2+1):
        if len(frames) % length == 0 and frames == frames[:length] * (len(frames)//length):
            return frames[:length]
    return frames


def capture_animation(core, name, count, save):
    tracks = (['wheel' + str(n) for n in range(4)] if name == 'reznor'
              else ['main', 'decoy2', 'decoy4'] if name in ('lemmy', 'wendy')
              else ['main'])
    sequences = {track: [] for track in tracks}
    files, registration = {}, {}
    for _ in range(count):
        frame = list(poses(core, name))
        if sorted(track for track, _, _ in frame) != sorted(tracks):
            raise ValueError('Missing native boss parts in ' + name)
        for track, image, owner in frame:
            key = (*image, tuple(owner.items()))
            if key not in files:
                filename = save(f'{name}-{len(files)}.png', image)
                files[key] = filename
                registration[filename] = owner
            sequences[track].append(files[key])
        core.run()
    return {'tracks': {t: period(f) for t, f in sequences.items()}, 'registration': registration}
