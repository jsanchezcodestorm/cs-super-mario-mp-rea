"""Run ScalePlatformMain in PAL E1 for both pan spacings and contact sides."""
import sys
from pathlib import Path

from native_rooms import Core, cartridge_image, write_word
from probe_player_contacts import foreground_address, put_tile
from probe_shell_contacts import flat_room, position, spawn


def verify(core, image, scene, x, right):
    core.restore(scene)
    r, slot, y = core.ram, 5, 224
    span = 64 if x & 16 else 128
    spawn(r, image, slot, 0x8f, x)
    position(r, slot, x, y)
    for column in (x // 16, (x + span) // 16):
        for row in range(14, 21):
            put_tile(r, column, row, 0xa2)
    core.run(2)
    assert r[0xc2 + slot] + 256*r[0x1602 + slot] == x + span
    oam = 64 + r[0x15ea + slot] // 4
    assert [r[0x200+4*i] for i in range(oam, oam+4)] == [x+span-8, x+span+8, x-8, x+8]
    write_word(r, 0x94, x + (span if right else 0))
    write_word(r, 0x96, y - 32)
    r[0x7d] = 0
    for frame in range(1, 65):
        core.run()
        left_y = r[0xd8+slot] + 256*r[0x14d4+slot]
        right_y = r[0x1534+slot] + 256*r[0x151c+slot]
        displacement = ((frame-1) * (-8 if right else 8)) // 16
        assert (left_y, right_y) == (y+displacement, y-displacement)
        assert r[0x1471] == 1
    assert r[foreground_address((x + (span if right else 0))//16, 14)] == 0x25
    write_word(r, 0x94, x - 55)
    write_word(r, 0x96, 168)
    core.run(16)
    assert r[0xaa+slot] == (2 if right else 254)
    print(f'{span}px, rider on {"right" if right else "left"}: 64 paired positions, 32px caps, stem, return speed verified')


if __name__ == '__main__':
    library, rom = map(Path, sys.argv[1:])
    image = cartridge_image(rom)
    core = Core(library, image)
    try:
        scene = flat_room(core)
        for x in (96, 112):
            for right in (False, True):
                verify(core, image, scene, x, right)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
