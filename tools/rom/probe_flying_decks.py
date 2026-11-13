"""Measure the PAL flying blocks in Forest Secret Area and with a Hammer Brother."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, write_word
from probe_pipe_plants import sprite_position
from probe_shell_contacts import flat_room, spawn, position


def forest_pair(core, base):
    enter_room(core, base, '122')
    core.run(40)
    r = core.ram
    left, right = sorted((i for i in range(12) if r[0x9e+i] == 0xc1 and r[0x14c8+i] == 8),
                         key=lambda i: sprite_position(r,i)[0])
    assert [sprite_position(r, i) for i in (left,right)] == [(192,224),(272,224)]
    core.run(20)
    assert [sprite_position(r, i) for i in (left,right)] == [(192,224),(272,224)]
    for n in range(579):
        x,y = sprite_position(r, right)
        write_word(r,0x94,x)
        write_word(r,0x96,y-31)
        r[0x1497] = 255
        r[0x7d] = 16
        core.run()
        phase = max(0,n-254) % 1024
        height = n/2 if n <= 254 else 127 - min(phase,1024-phase)/2
        assert sprite_position(r,left) == (int(192+n/2),int(224-height)), (n,sprite_position(r,left))
        assert sprite_position(r,right) == (int(272+n/2),int(224+height)), (n,sprite_position(r,right))
    print('122: both decks idle until contact, then 579 PAL frames each; first reversal after 254 moving frames.')


def winged_blocks(core, image):
    flat_room(core)
    r = core.ram
    spawn(r,image,0,0x9c,128)
    position(r,0,128,240)
    core.run()
    x,y = sprite_position(r,0)
    speed_x = speed_y = 0
    accel_x,accel_y = 1,2
    for n in range(260):
        r[0x1497] = 255
        write_word(r,0x94,int(x)-60)
        write_word(r,0x96,int(y)-48)
        core.run()
        if not r[0x13] & 1:
            speed_x += accel_x
            speed_y += accel_y
            if abs(speed_x) == 32: accel_x = -accel_x
            if abs(speed_y) == 32: accel_y = -accel_y
        x += speed_x / 16
        y += speed_y / 16
        assert sprite_position(r,0) == (int(x),int(y)), (n,sprite_position(r,0),x,y,r[0x13],r[0xb6],r[0xaa])
    print('9C: 260 PAL frames of unoccupied flight with independent speed reversals on both axes.')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core',type=Path)
    parser.add_argument('rom',type=Path)
    args=parser.parse_args()
    image=cartridge_image(args.rom)
    core=Core(args.core.resolve(),image)
    try:
        base=first_course(core)
        forest_pair(core,base)
        # Reboot to prepare the deliberately flat room around one flying block.
        core.lib.retro_reset()
        winged_blocks(core,image)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
