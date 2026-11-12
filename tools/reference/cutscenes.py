"""Render the cartridge's seven castle vignettes and complete staff roll."""
import ctypes as C
import json
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from core import Core

COURSES = ('101','007','11c','00e','020','01a','110','ending')


def record(core, baseline, index, output, fps, rate):
    core.restore(baseline)
    core.ram[0x13c6] = index
    core.ram[0x100] = 0x19
    core.audio.clear()
    core.record_audio = True
    with tempfile.TemporaryDirectory(prefix='smw-scene-') as temp:
        silent = Path(temp,'video.mp4')
        sound = Path(temp,'audio.wav')
        ffmpeg = [os.environ.get('FFMPEG','ffmpeg'),'-hide_banner','-loglevel','error','-y']
        args = ['-f','rawvideo','-pix_fmt','rgb565le','-s','256x224','-r',str(fps/2),
                '-i','pipe:0','-c:v','libx264','-preset','veryfast','-crf','15','-pix_fmt','yuv420p',str(silent)]
        process = subprocess.Popen(ffmpeg+args,stdin=subprocess.PIPE)
        try:
            for frame in range(20000):
                core.capture_video = frame%2==0
                # Castle messages wait for a button after the text has appeared.
                core.run(1,256 if index<8 and frame>300 and frame%200==0 else 0)
                if core.capture_video and core.frame:
                    w,h,data = core.frame
                    if (w,h)!=(256,224):
                        raise ValueError(f'unexpected cinematic resolution {w}x{h}')
                    process.stdin.write(data)
                if core.ram[0x100] == (0x29 if index==8 else 0x0b):
                    break
            else:
                raise RuntimeError(f'cutscene {index} did not reach its ending')
        finally:
            process.stdin.close()
            result = process.wait()
        if result:
            raise RuntimeError('ffmpeg failed while encoding a cutscene')
        with wave.open(str(sound),'wb') as stream:
            stream.setparams((2,2,round(rate),0,'NONE',''))
            stream.writeframes(core.audio)
        subprocess.run(ffmpeg+['-i',str(silent),'-i',str(sound),'-c:v','copy','-c:a','aac',
                               '-b:a','96k','-movflags','+faststart',str(output)],check=True)
        if index==8:
            core.capture_video=True
            core.run(2)
            core.png(output.with_name('end.png'))
        return round((frame+1)/fps*60)


def generate(library,image,output,fps,rate):
    output.mkdir(parents=True,exist_ok=True)
    core=Core(library,image)
    core.run(450)
    if core.ram[0x100]!=7:
        raise RuntimeError('title boot failed before cinematic extraction')
    baseline=core.freeze()
    ticks = {key:record(core,baseline,i,output/(key+'.mp4'),fps,rate)
             for i,key in enumerate(COURSES,1)}
    core.lib.retro_unload_game()
    core.lib.retro_deinit()
    (output/'durations.json').write_text(json.dumps(ticks))
