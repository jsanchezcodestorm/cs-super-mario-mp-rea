"""Measure Piranha OAM and pipe occlusion in three actual PAL E1 rooms."""
import argparse
import json
from pathlib import Path

from boss_capture import LayerSwitch
from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word


def sprite_position(ram, slot):
    return (ram[0xe4+slot] + 256*ram[0x14e0+slot],
            ram[0xd8+slot] + 256*ram[0x14d4+slot])


def position_observer(core, x, y):
    ram = core.ram
    write_word(ram, 0x94, x)
    write_word(ram, 0x96, y)
    ram[0x7b] = ram[0x7d] = 0
    ram[0x1497] = 20
    core.run()
    # The guided camera crosses solid walls in 10A. Cancel only the observer's
    # death animation so the real level loader continues streaming new columns.
    if ram[0x71] == 9:
        ram[0x71] = ram[0x9d] = ram[0x1496] = 0


def graphics_parts(ram, x):
    cx = read_word(ram, 0x1a)
    return [i for i in range(64, 128)
            if ram[0x201+4*i] < 224
            and ram[0x200+4*i] + cx - 256*(ram[0x420+i] & 1) in (x,x+8)]


def captures(core, switch, slot, inverted):
    r = core.ram
    saved = core.freeze()
    # Hold this exact native sprite pose through the libretro layer-option
    # latency. All four framebuffer passes start from this same WRAM/VRAM.
    r[0x9d] = 1
    held = core.freeze()
    blank, obj, bg, scene = [switch.capture(held, disabled) for disabled in (31, 15, 30, 14)]
    x, y = sprite_position(r, slot)
    parts = graphics_parts(r, x)
    assert len(parts) == (2 if inverted else 5), (slot, x, y, parts)
    assert all((r[0x203+4*i] >> 4 & 3) == 1 for i in parts)
    # Mario's standing body occupies OAM 68 and 69. The native loader must
    # keep every head and leaf behind both parts, even in memory setting 7.
    assert min(parts) > 69, ('plant ahead of player', r[0x1692], slot, parts)
    cx, cy = read_word(r,0x1a), read_word(r,0x1c)
    # Include overscan above and below the 16px-wide head and leaves.
    visible, covered = 0, 0
    for py in range(max(32, y-cy-12),min(224, y-cy+34)):
        for px in range(max(0, x-cx),min(256, x-cx+16)):
            i = py*256+px
            if obj[i] == blank[i] or obj[i] == bg[i]:
                continue
            if scene[i] == obj[i]:
                assert bg[i] == blank[i], ('OBJ leaked through pipe', px, py)
                visible += 1
            else:
                # An opaque BG pixel can use the same color as the backdrop.
                assert scene[i] == bg[i], ('unexpected color math', px, py, obj[i], bg[i], scene[i])
                covered += 1
    core.restore(saved)
    switch.show(0)
    return visible, covered


def jump_cycle(core, slot, observer_x, observer_y):
    r = core.ram
    samples = []
    for _ in range(850):
        before = r[0xc2+slot]
        position_observer(core,observer_x,observer_y)
        state = r[0xc2+slot]
        if not samples and (before,state) != (0,1):
            continue
        x, y = sprite_position(r,slot)
        samples.append([r[0x14], x, y, r[0x14ec+slot], r[0xaa+slot], state, r[0x1540+slot],
                        r[0x1570+slot], r[0x151c+slot], r[0x1588+slot]])
        if state == 0:
            return samples
    raise AssertionError('Piranha did not jump and land')


def scene(core, switch, base, room, number, x, y):
    enter_room(core, base, room)
    core.run(50)
    ram = core.ram
    # The real sprite loader, tile uploader and scroll registers are advanced
    # normally while moving the observer across the room.
    for px in range(read_word(ram,0x94), x-70, 2):
        position_observer(core, px, y-48)
    slot = next(i for i in range(12) if ram[0x14c8+i] == 8 and
                ram[0x9e+i] == number and sprite_position(ram,i)[0] == x+8)
    start = core.freeze()
    inverted = number == 0x2a
    hidden_y = y-17 if inverted else y
    phases = {}
    prev = sprite_position(ram,slot)[1]
    for _ in range(600):
        position_observer(core, x-70, y-48)
        now = sprite_position(ram,slot)[1]
        assert ram[0x14c8+slot] == 8
        depth = (now-hidden_y) if inverted else (hidden_y-now)
        moving_out = (now > prev) if inverted else (now < prev)
        prev = now
        if depth == 0 and (ram[0xc2+slot] & 3) == 0:
            phase = 'hidden'
        elif depth >= (31 if inverted else 80):
            phase = 'out'
        elif 8 <= depth <= 14 and now != hidden_y:
            phase = 'emerging' if moving_out else 'returning'
            # Slow returning jumping plants can have successive equal Y values.
            if not inverted:
                phase = 'emerging' if ram[0xaa+slot] >= 128 else 'returning'
        else:
            continue
        if phase not in phases:
            phases[phase] = (now,*captures(core,switch,slot,inverted))
        if len(phases) == 4:
            break
    assert set(phases) == {'hidden','emerging','out','returning'}, (room, phases)
    for phase, (_, shown, masked) in phases.items():
        if phase == 'hidden': assert shown == 0 and masked > 0, (room,phase,phases)
        elif phase == 'out':
            # The inverted stem still overlaps the bottom lip by two scanlines.
            assert shown > 0 and (masked > 0) == inverted, (room,phase,phases)
        else: assert shown > 0 and masked > 0, (room,phase,phases)
    print(f'{room} ${number:02X} placed ({x},{y}), slot {slot}, OAM {graphics_parts(ram,x+8)}: '
          f'(Y, OBJ visible, covered by BG1) {phases}')


    if not inverted:
        core.restore(start)
        return jump_cycle(core, slot, x-70, y-48)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    parser.add_argument('--trace', type=Path, help='Write complete native launch-to-landing samples to JSON')
    args = parser.parse_args()
    core = Core(args.core.resolve(),cartridge_image(args.rom))
    try:
        core.capture_video = True
        switch = LayerSwitch(core)
        base = first_course(core)
        jumps = {}
        for case in [('105',0x4f,1808,336),('125',0x50,256,352),('10a',0x2a,2992,320)]:
            result = scene(core,switch,base,*case)
            if result:
                jumps[case[0]] = result
        if args.trace:
            args.trace.write_text(json.dumps({'columns':['effFrame','x','y','subY','speed','state','timer','head','leaves','blocked'],
                                              'rooms':jumps},separators=(',',':')))
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()
