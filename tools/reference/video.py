"""Encode every RGB565 framebuffer supplied by the PAL libretro core, in order."""
import os
import subprocess
from contextlib import contextmanager


def ffmpeg():
    return [os.environ.get('FFMPEG', 'ffmpeg'), '-hide_banner', '-loglevel', 'error', '-y']


@contextmanager
def record_frames(path, fps):
    args = ['-f', 'rawvideo', '-pix_fmt', 'rgb565le', '-s', '256x224', '-r', str(fps),
            '-i', 'pipe:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(path)]
    with subprocess.Popen(ffmpeg() + args, stdin=subprocess.PIPE) as process:
        def write(frame):
            if frame is None or frame[:2] != (256, 224):
                raise ValueError('Expected a 256x224 PAL framebuffer')
            process.stdin.write(frame[2])
        try:
            yield write
        finally:
            process.stdin.close()
        if process.wait():
            raise RuntimeError('Video encoding failed for ' + str(path))
