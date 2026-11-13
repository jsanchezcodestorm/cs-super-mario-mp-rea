"""Collect gameplay-selected poses with their original per-instance OAM slot."""
from boss_animation import poses


def reznor_tracks(core, save):
    ram, base = core.ram, core.freeze()
    tracks, registration = {}, {}
    for direction, facing in ((0, 'right'), (1, 'left')):
        for pose, timer in (('idle', None), ('turn', 0x15ac), ('spit', 0x1558)):
            core.restore(base)
            for i in range(12):
                if ram[0x9e+i] != 0xa9 or ram[0x14c8+i] != 8:
                    continue
                ram[0x157c+i] = direction
                ram[0x1570+i] = ram[0x1558+i] = ram[0x15ac+i] = 0
                if timer:
                    ram[timer+i] = 4
            # Avoid the once-per-64-frame target check on any of the four slots.
            ram[0x13] = ram[0x14] = 6
            core.run()
            for wheel, image, owner in poses(core, 'reznor'):
                track = f'{wheel}-{pose}-{facing}'
                filename = save(f'reznor-{track}.png', image)
                tracks[track] = [filename]
                registration[filename] = owner
    core.restore(base)
    return {'tracks': tracks, 'registration': registration}
