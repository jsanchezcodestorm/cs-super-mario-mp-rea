"""Produce native boss artwork from the PAL cartridge during local extraction."""
import ctypes as C
import json
import sys
from pathlib import Path

from native_rooms import Core, cartridge_image, first_course, enter_room
from map_tiles import PPU, vram
from boss_pixels import mode7, oam, png, rgba_palette, trim, video_pixels

# Boss IDs are inferred from the same sprite Y parameter used by the game.
ROOMS = {'morton':'0e5', 'roy':'0cc', 'ludwig':'0d9', 'iggy':'1f6',
         'larry':'1eb', 'reznor':'0d5', 'bowser':'1c7'}


class Option(C.Structure):
    _fields_ = [('key', C.c_char_p), ('value', C.c_char_p)]


class LayerSwitch:
    """Use Snes9x's libretro layer options to capture authentic scenery separately."""
    def __init__(self, core):
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


def actor(core, name):
    memory = vram(core)
    colors = rgba_palette(PPU.in_dll(core.lib, 'PPU'))
    if name in ('iggy', 'larry', 'reznor'):
        sprite = 0xa9 if name == 'reznor' else 0x29
        slot = next(i for i in range(12) if core.ram[0x14c8+i] == 8 and core.ram[0x9e+i] == sprite)
        first = 64 + core.ram[0x15ea+slot]//4
        if name == 'reznor':
            # The Reznor routine draws its four body tiles before the platform pair.
            first -= 4
        return trim(oam(core.ram, memory, colors, range(first, first+(6 if name=='reznor' else 4))))
    w,h = (64,96) if name == 'bowser' else (32,32)
    return trim(mode7(memory, colors, 30,34,w,h))


def arena(core, layers, name):
    tilting = name in ('iggy','larry')
    # $00:992C writes repeating 16px bridge, ceiling and lava stripes. Mode 7
    # renders the boss on the same layer; the far-left strip excludes its art.
    layers.show(31 if tilting else 15 if name=='bowser' else 30)
    core.run(2)
    width,height,raw = video_pixels(core.frame)
    if width != 256 or height < 224:
        raise ValueError('Unexpected native boss viewport')
    result = bytearray(raw[:width*224*4])
    for y in range(224):
        row = raw[y*width*4:(y+1)*width*4]
        if name == 'bowser' and y < 192:
            row = bytes((0,0,0,255))*width
        elif not tilting:
            # Mario is drawn over the bricks in Bowser's OBJ layer.
            row = row[:64] * 16
        result[4*y*width:4*(y+1)*width] = row
    colors = rgba_palette(PPU.in_dll(core.lib, 'PPU'))
    memory = vram(core)
    if name in ('morton','roy','ludwig') or tilting:
        # Castle background decorations are OAM 0..63. Iggy/Larry's animated
        # lava surface is emitted in the high sprite slots.
        entries = range(108,124) if tilting else range(64)
        _,_,objects = oam(core.ram,memory,colors,entries)
        for i in range(width*224):
            if objects[4*i+3]:
                result[4*i:4*i+4] = objects[4*i:4*i+4]
    layers.show(0)
    return width,224,result


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
        scene = {'background':save(name+'-arena.png',arena(core,layers,name))}
        memory = vram(core)
        colors = rgba_palette(PPU.in_dll(core.lib,'PPU'))
        if name in ('iggy','larry','reznor'):
            platform = trim(mode7(memory,colors,8,8,384,352))
            part = 'wheel' if name == 'reznor' else 'platform'
            scene[part] = save(name+'-'+part+'.png',platform)
        frames = []
        # The clown car enters from above. Its sprite starts with only its
        # propeller showing, before Bowser rises into the visible cockpit.
        core.run(510 if name=='bowser' else 22)
        for i in range(2):
            frames.append(save(name+'-'+str(i)+'.png',actor(core,name)))
            core.run(20)
        scene['frames'] = frames
        scenes[name] = scene
    levels = json.loads((generated/'content.json').read_text())['levels']
    rooms = {key:scenes[boss_name(level)] for key,level in levels.items() if level['specialMode7']}
    for key, name in [('1f2', 'lemmy'), ('0d3', 'wendy')]:
        enter_room(core, base, key)
        core.run(208)
        scene = {'frames': [], 'decoys': []}
        for frame in range(2):
            memory = vram(core)
            colors = rgba_palette(PPU.in_dll(core.lib, 'PPU'))
            ram = core.ram
            for role, dummy in [('frames', False), ('decoys', True)]:
                slot = next(i for i in range(12) if ram[0x14c8+i] == 8 and ram[0x9e+i] == 0x29
                            and bool(ram[0x1570+i]) == dummy)
                first = 64 + ram[0x15ea+slot] // 4
                image = trim(oam(ram, memory, colors, range(first, first + 6)))
                scene[role].append(save(f'{name}-{role}-{frame}.png', image))
            core.run(12)
        rooms[key] = scene
    (output/'index.json').write_text(json.dumps(rooms,separators=(',',':')))
    core.lib.retro_unload_game()
    core.lib.retro_deinit()


if __name__ == '__main__':
    core_file, rom_file, generated = map(Path, sys.argv[1:])
    generate(core_file, cartridge_image(rom_file), generated)
