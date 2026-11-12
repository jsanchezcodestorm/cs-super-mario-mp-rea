"""Boot the supplied PAL image and enter levels using the native game loader."""
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'reference'))
from core import Core


def read_word(ram, address):
    return ram[address] + 256 * ram[address + 1]


def write_word(ram, address, value):
    ram[address] = value & 255
    ram[address + 1] = (value >> 8) & 255


def cartridge_image(path):
    image = Path(path).read_bytes()
    if len(image) == 524800:
        image = image[512:]
    if hashlib.sha256(image).hexdigest() != '5cc54b1e5c8d3c7701a5e20514145c3b36f15f26fe0a4fe6d2e43677e4b4eda9':
        raise ValueError('Expected Super Mario World Europe revision 1')
    return image


def first_course(core):
    core.run(400)
    for key in [8,256,256]:
        core.run(2,key)
        core.run(60)
    core.run(500)
    for _ in range(20):
        core.run(3,8)
        core.run(80)
        if core.ram[256] == 14:
            break
    core.run(2,64)
    core.run(75)
    core.run(2,256)
    core.run(200)
    if core.ram[256] != 20 or core.ram[0x13bf] != 0x29:
        raise RuntimeError('Original PAL starting level was not reached')
    return core.freeze()


def enter_room(core, base, room):
    core.restore(base)
    number = int(room, 16)
    # Native level entry through a diagnostic screen exit.
    core.ram[0x141a] = 1
    core.ram[256] = 0x11
    core.ram[0x1f11] = number >> 8
    core.ram[0x1b93] = 0
    for i in range(32):
        core.ram[0x19b8+i] = number & 255
    for tick in range(1, 201):
        core.run()
        if core.ram[256] == 20:
            return tick
    raise RuntimeError('Native room failed to initialize: ' + room)
