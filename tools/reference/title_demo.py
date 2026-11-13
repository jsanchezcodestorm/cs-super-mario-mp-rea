"""Record one complete native title loop, starting at the mounted title poster."""
from core import Core
from video import record_frames


def mounted_title(ram):
    return (ram[0x100] == 7 and ram[0x187a] and ram[0x1a] + 256 * ram[0x1b] >= 882
            and ram[0x96] == 80)


def generate(library, image, directory, fps):
    core = Core(library, image)
    core.capture_video = True
    try:
        for _ in range(2000):
            core.run()
            if mounted_title(core.ram):
                break
        else:
            raise RuntimeError('Mounted title pose was not reached')
        core.png(directory / 'title.png')
        restarted = False
        with record_frames(directory / 'title.mp4', fps) as write:
            for frame in range(2500):
                write(core.frame)
                core.run()
                if core.ram[0x100] != 7:
                    restarted = True
                if restarted and mounted_title(core.ram):
                    return frame + 1
        raise RuntimeError('The title demo did not loop')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
