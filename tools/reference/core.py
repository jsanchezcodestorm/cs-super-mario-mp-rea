"""Minimal offline libretro frontend for PAL capture. No emulator in the web build."""
import ctypes as C
import struct
import zlib
from pathlib import Path

P = C.c_void_p
U = C.c_uint
S = C.c_size_t


class Game(C.Structure):
    _fields_ = [('path', C.c_char_p), ('data', P), ('size', S), ('meta', C.c_char_p)]


class Core:
    def __init__(self, library, image):
        self.lib = lib = C.CDLL(str(library))
        self.keys = 0
        self.audio = bytearray()
        self.frame = None
        self.capture_video = False
        self.record_audio = False
        self.callbacks = []

        def connect(name, function, result, *args):
            cb = C.CFUNCTYPE(result, *args)(function)
            self.callbacks.append(cb)
            getattr(lib, 'retro_set_' + name)(cb)

        def env(cmd, data):
            if cmd == 10:  # RGB565
                return C.cast(data, C.POINTER(C.c_int))[0] == 2
            if cmd == 3:
                C.cast(data, C.POINTER(C.c_bool))[0] = True
                return True
            return False

        def video(data, w, h, pitch):
            if self.capture_video and data:
                self.frame = w, h, b''.join(C.string_at(data + y * pitch, w * 2) for y in range(h))

        def samples(data, frames):
            if self.record_audio:
                self.audio.extend(C.string_at(data, frames * 4))
            return frames

        def input_state(port, device, index, button):
            return int(not port and bool(self.keys & (1 << button)))

        connect('environment', env, C.c_bool, U, P)
        connect('video_refresh', video, None, P, U, U, S)
        connect('audio_sample_batch', samples, S, P, S)
        connect('audio_sample', lambda a,b: None, None, C.c_int16, C.c_int16)
        connect('input_poll', lambda: None, None)
        connect('input_state', input_state, C.c_int16, U,U,U,U)
        lib.retro_init()
        self.image = C.create_string_buffer(image)
        game = Game(b'local.sfc', C.cast(self.image,P), len(image), None)
        lib.retro_load_game.restype = C.c_bool
        if not lib.retro_load_game(C.byref(game)):
            raise ValueError('libretro could not load the supplied cartridge')
        lib.retro_get_memory_data.restype = P
        self.ram = (C.c_ubyte * 131072).from_address(lib.retro_get_memory_data(2))
        lib.retro_serialize_size.restype = S

    def run(self, frames=1, keys=0):
        self.keys = keys
        for _ in range(frames):
            self.lib.retro_run()

    def freeze(self):
        n = self.lib.retro_serialize_size()
        data = C.create_string_buffer(n)
        if not self.lib.retro_serialize(data, n):
            raise RuntimeError('serialize failed')
        return data

    def restore(self, data):
        if not self.lib.retro_unserialize(data, len(data)):
            raise RuntimeError('unserialize failed')

    def png(self, path):
        w,h,data = self.frame
        rows = bytearray()
        for y in range(h):
            rows.append(0)
            for (pixel,) in struct.iter_unpack('<H', data[y*w*2:(y+1)*w*2]):
                rows.extend(((pixel>>11)*255//31, (pixel>>5&63)*255//63, (pixel&31)*255//31))
        def chunk(key, value):
            return struct.pack('>I',len(value))+key+value+struct.pack('>I',zlib.crc32(key+value))
        Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))
