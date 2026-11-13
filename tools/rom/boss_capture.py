"""Produce native boss artwork from the PAL cartridge during local extraction."""
import ctypes as C
import json
import sys
from pathlib import Path

from native_rooms import Core, cartridge_image, first_course, enter_room
from map_tiles import PPU, vram
from boss_pixels import mode7, png, rgba_palette, trim
from boss_animation import capture_animation
from boss_facing import reznor_tracks
from bowser_feedback import capture_bowser_feedback
from boss_scenery import capture_arena

# Boss IDs are inferred from the same sprite Y parameter used by the game.
ROOMS = {'morton':'0e5', 'roy':'0cc', 'ludwig':'0d9', 'iggy':'1f6',
         'larry':'1eb', 'reznor':'0d5', 'bowser':'1c7'}


class Option(C.Structure):
    _fields_ = [('key', C.c_char_p), ('value', C.c_char_p)]


class LayerSwitch:
    """Use Snes9x's libretro layer options to capture authentic scenery separately."""
    def __init__(self, core):
        self.core = core
        self.mask = 0
        self.updated = True
        original = core.callbacks[0]

        @C.CFUNCTYPE(C.c_bool, C.c_uint, C.c_void_p)
        def environment(command, data):
            if command == 17:  # RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE
                C.cast(data, C.POINTER(C.c_bool))[0] = self.updated
                self.updated = False
                return True
            if command == 15:
                option = C.cast(data, C.POINTER(Option)).contents
                if option.key.startswith(b'snes9x_layer_'):
                    index = int(option.key[-1:]) - 1
                    option.value = b'disabled' if self.mask & (1<<index) else b'enabled'
                    return True
            return original(command, data)

        core.callbacks.append(environment)
        core.lib.retro_set_environment(environment)

    def show(self, disabled):
        self.mask = disabled
        self.updated = True

    def capture(self, state, disabled):
        """Replay the same three PAL frames after the option change reaches libretro."""
        self.core.restore(state)
        self.show(disabled)
        self.core.run(3)
        width, _, frame = self.core.frame
        if width != 256:
            raise ValueError('Expected a native 256-pixel viewport')
        return memoryview(frame).cast('H')


def boss_name(room):
    sprite = next(s for s in room['sprites'] if s['spriteId'] in (0x29,0xa9,0xa0))
    if sprite['spriteId']==0xa9: return 'reznor'
    if sprite['spriteId']==0xa0: return 'bowser'
    return ['morton','roy','ludwig','iggy','larry'][sprite['y']//16]


def generate(core_file, image, generated):
    output = generated/'bosses'
    output.mkdir(parents=True,exist_ok=True)
    core = Core(core_file,image)
    core.capture_video = True
    base = first_course(core)
    layers = LayerSwitch(core)
    scenes = {}

    def save(filename, image):
        (output/filename).write_bytes(png(*image))
        return filename

    for name,room in ROOMS.items():
        entry_tick = enter_room(core,base,room)
        core.run(180-entry_tick)
        scene = capture_arena(core,layers,name,save)
        memory = vram(core)
        colors = rgba_palette(PPU.in_dll(core.lib,'PPU'))
        if name in ('iggy','larry','reznor'):
            platform = trim(mode7(memory,colors,8,8,384,352))
            part = 'wheel' if name == 'reznor' else 'platform'
            scene[part] = save(name+'-'+part+'.png',platform)
        # The clown car enters from above. Its sprite starts with only its
        # propeller showing, before Bowser rises into the visible cockpit.
        core.run(510 if name=='bowser' else 22)
        if name == 'ludwig':
            # WallKoopaKids waits for Layer1XPos >= $7e before attacking.
            for _ in range(200):
                if core.ram[0x1a] >= 0x7e:
                    break
                core.run(1, 1 << 7)  # walk right
            else:
                raise ValueError('Ludwig did not reach his battle camera')
            core.run(12)
        if name == 'reznor':
            scene.update(reznor_tracks(core, save))
        else:
            scene.update(capture_animation(core, name, 320 if name == 'ludwig' else 128, save))
        if name == 'bowser':
            tracks, registration = capture_bowser_feedback(core, layers, save)
            scene['tracks'].update(tracks)
            scene['registration'].update(registration)
        print(name, {track: (len(frames), len(set(frames))) for track, frames in scene['tracks'].items()})
        scenes[name] = scene
    levels = json.loads((generated/'content.json').read_text())['levels']
    rooms = {key:scenes[boss_name(level)] for key,level in levels.items() if level['specialMode7']}
    for key, name in [('1f2', 'lemmy'), ('0d3', 'wendy')]:
        enter_room(core, base, key)
        core.run(208)
        rooms[key] = capture_animation(core, name, 32, save)
        print(name, {track: (len(frames), len(set(frames))) for track, frames in rooms[key]['tracks'].items()})
    (output/'index.json').write_text(json.dumps(rooms,separators=(',',':')))
    core.lib.retro_unload_game()
    core.lib.retro_deinit()


if __name__ == '__main__':
    core_file, rom_file, generated = map(Path, sys.argv[1:])
    generate(core_file, cartridge_image(rom_file), generated)
