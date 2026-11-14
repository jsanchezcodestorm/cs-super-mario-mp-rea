"""Capture private reference images and rendered APU audio from the E1 cartridge."""
import argparse
import ctypes as C
import os
import hashlib
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path
from core import Core
from world import generate as generate_world
from cutscenes import generate as generate_cutscenes
from title_demo import generate as generate_title, mounted_title

ROM_SHA256 = '5cc54b1e5c8d3c7701a5e20514145c3b36f15f26fe0a4fe6d2e43677e4b4eda9'
# Bank selector and SPC I/O mirrors from SMWDisX SMW_E1.sym.
BANK_ROUTINES = {'map': 0x810e, 'level': 0x8148, 'ending': 0x8159}
MAP = ['title','donut-plains','overworld','vanilla-dome','star-world','forest','valley','valley-opens','special-world']
LEVEL = ['athletic','level','water','bowser-start','boss','underground','ghost','castle',
         'death','game-over','boss-clear','exit','star','switch','keyhole','keyhole-end',
         'spotlight','bonus','intro','bonus-over','cutscene','bowser-interlude','zoom-out',
         'zoom-in','bowser-phase-2','bowser-phase-3','bowser-defeated','peach','bowser-interlude-2']
SOUNDS = {'jump':(1,1),'coin':(3,1),'powerup':(0,10),'splat':(0,2),'spin-kill':(0,8),'stomp':(0,19),'pipe':(0,4),
          'kick':(0,3),'checkpoint':(0,5),'spin':(3,4),'one-up':(3,5),'fireball':(3,6),'shatter':(3,7),
          'crush':(3,9),
          'tongue':(3,33),'swallow':(0,6),'spit':(0,32),'yoshi-stomp':(3,37),'yoshi-grow':(3,31)}

SOUNDS.update({f'stomp-{i}': (0, 18+i) for i in range(2, 8)})


class Geometry(C.Structure):
    _fields_ = [('sizes',C.c_uint*4),('aspect',C.c_float)]


class AV(C.Structure):
    _fields_ = [('geometry',Geometry),('fps',C.c_double),('rate',C.c_double)]


def boot(library, image, bank):
    cartridge = bytearray(image)
    if bank != 'map':
        # Redirect the title's bank upload in this offline diagnostic copy.
        cartridge[0x10e:0x111] = b'\x4c' + BANK_ROUTINES[bank].to_bytes(2,'little')
    core = Core(library, bytes(cartridge))
    core.capture_video = bank == 'map'
    for _ in range(900):
        core.run()
        if core.ram[0x100] == 7: break
    if bank == 'map':
        # Late in the authentic title demo Mario rides Yoshi in front of the
        # diagonally sloped hill. Stop before the first Koopa encounter.
        for _ in range(1200):
            core.run()
            if mounted_title(core.ram):
                break
        else:
            raise RuntimeError('title demo did not reach the mounted sequence')
    else:
        core.run(12)
    if core.ram[0x100] != 7:
        raise RuntimeError('reference title screen was not reached')
    core.ram[0x100] = 0x29  # empty game mode keeps NMI/audio running
    core.ram[0x1dfb] = 0x80  # original fade-out command
    core.run(180)
    return core


def record(core, state, port, command, seconds, target, wave_target=None):
    core.restore(state)
    info = AV()
    core.lib.retro_get_system_av_info(C.byref(info))
    core.audio.clear()
    core.record_audio = True
    core.ram[0x1df9+port] = command
    core.run(round(info.fps * seconds))
    core.record_audio = False
    if max(core.audio, default=0) == 0:
        raise RuntimeError(f'silent capture: {target.name}')
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        with wave.open(tmp.name, 'wb') as stream:
            stream.setparams((2,2,round(info.rate),0,'NONE',''))
            stream.writeframes(core.audio)
        if wave_target:
            shutil.copyfile(tmp.name, wave_target)
        subprocess.run([os.environ.get('FFMPEG','ffmpeg'),'-hide_banner','-loglevel','error','-y','-i',tmp.name,'-c:a','aac','-b:a','96k',str(target)],check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('core',type=Path)
    parser.add_argument('rom',type=Path)
    parser.add_argument('output',type=Path)
    args = parser.parse_args()
    image = args.rom.read_bytes()
    if len(image)==524800: image=image[512:]
    if hashlib.sha256(image).hexdigest()!=ROM_SHA256:
        raise ValueError('requires Super Mario World Europe revision 1')
    generate_world(args.core,image,args.output/'world')
    audio = args.output/'audio'
    audio.mkdir(parents=True, exist_ok=True)
    for bank,songs in [('map',enumerate(MAP,1)),('level',enumerate(LEVEL,1)),('ending',[(9,'credits'),(10,'yoshi-house'),(11,'thank-you')])]:
        core = boot(args.core,image,bank)
        core.capture_video = False
        state = core.freeze()
        for cmd,name in songs:
            length = {'death':4,'exit':9,'one-up':2,'game-over':7}.get(name,75)
            record(core,state,2,cmd,length,audio/(name+'.m4a'))
        if bank == 'level':
            for name,(port,cmd) in SOUNDS.items():
                wave_target = audio/(name+'.wav') if name in ('splat', 'spin-kill') else None
                record(core,state,port,cmd,1.5,audio/(name+'.m4a'),wave_target)
        info = AV()
        core.lib.retro_get_system_av_info(C.byref(info))
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
    generate_title(args.core, image, args.output, info.fps)
    generate_cutscenes(args.core,image,args.output/'movies',info.fps,info.rate)

if __name__ == '__main__':
    main()
