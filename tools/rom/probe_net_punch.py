"""Trace native E1 fence punches on both controller ports in Iggy's Castle."""
import argparse
from pathlib import Path

from native_rooms import Core, cartridge_image, enter_room, first_course, read_word, write_word
from probe_shell_contacts import POPUP, SCORE, STATUS, position, spawn
from boss_pixels import oam
from hud_tiles import crop, snes_colors
from map_tiles import vram
from reward_tiles import reward_sheet

Y, X, UP = 2, 512, 16


def sprite_position(ram):
    return ram[0xe4] + 256 * ram[0x14e0], ram[0xd8] + 256 * ram[0x14d4]


def score(ram, player):
    start = SCORE + player * 3
    return int.from_bytes(ram[start:start + 3], 'little') * 10


def check_pose(ram, behind, falling):
    # A living Koopa draws into the first two OAM entries for its slot.
    # SubSprGfx1 uses the next two entries for the vertically flipped pose.
    offset = 0x300 + ram[0x15ea] + (8 if falling else 0)
    tiles = (0x27, 0x07) if falling else (0x4c, 0x29) if behind else (0x07, 0x27)
    x, y = sprite_position(ram)
    attr = ram[0x166e] & 0x0f | (0x10 if behind else 0x20)
    if falling:
        attr |= 0x80 | (0x40 if ram[0xb6] == 8 else 0)
    for index, tile in enumerate(tiles):
        start = offset + index * 4
        ox, oy, otile, oattr = ram[start:start + 4]
        assert ox == (x - read_word(ram, 0x1a)) & 255
        assert oy == (y - read_word(ram, 0x1c) + 16 * index) & 255
        # Walking alternates horizontal flip as part of the climbing gait.
        assert otile == tile and (oattr if falling else oattr & ~0x40) == attr


def setup(core, base, image, number, player, side, other_side):
    core.restore(base)
    r = core.ram
    # Give each native turn its own controller. Positions are set before
    # first contact; all punches use normal X or Y presses via libretro.
    core.input_port = player
    r[0x0da0], r[0x0db3] = 0x82, player
    write_word(r, 0x94, 112)
    write_word(r, 0x96, 260)
    r[0x7b] = r[0x7d] = 0
    r[0x1497] = 200  # Isolate the punch from ordinary same-side contact.
    spawn(r, image, 0, number, 155)
    r[0x15f6] = r[0x166e] & 0x0f  # LoadSpriteTables: palette and CHR page.
    position(r, 0, 155, 260)
    core.run(3, UP)
    core.run(2)
    assert r[0x74] & 0x80 and r[STATUS] == 8
    r[0x13f9], r[0x1632] = side, other_side
    # A stationary enemy lets us resolve boundary pixels without changing
    # the E1 collision routines or the direction from which the punch comes.
    r[0xb6] = r[0xaa] = r[0x14ec] = r[0x14f8] = 0
    return read_word(r, 0x94), read_word(r, 0x96)


def strike(core, base, image, number, player, side, parity):
    r = core.ram
    px, py = setup(core, base, image, number, player, side, 1-side)
    if r[0x13] & 1 != parity:
        core.run()
    dx = -8 if side else 8
    position(r, 0, px + dx, py + 3)
    popup, hit, trajectory = False, None, []
    for frame in range(170):
        core.run(1, (X if player else Y) if frame == 0 else 0)
        if frame <= 8:
            assert r[0x149e] == 8-frame and bool(r[0x13e8]) == (1 <= frame <= 7)
            if r[0x13e8]:
                assert (read_word(r, 0x13e9), read_word(r, 0x13eb)) == (px + dx, py + 2)
        if hit is None and r[STATUS] == 2:
            hit = frame
            assert hit in (1, 2) and r[0x13] & 1
            assert (r[0xaa], r[0xb6]) == (0xb0, 0xf8 if side else 8)
            assert list(r[POPUP:POPUP + 6]).count(5) == 1
            check_pose(r, 1-side, falling=False)
            popup = True
        if hit is not None and frame == hit + 1:
            check_pose(r, 1-side, falling=True)
        if hit is not None and frame - hit < 72:
            assert r[STATUS] == 2 and r[0x1632] == 1 - side
            assert r[0xaa] == (min(64, -80 + 3*(frame-hit)) & 255)
            trajectory.append(sprite_position(r))
    assert popup and score(r, player) == 100 and score(r, 1-player) == 0
    assert min(y for x,y in trajectory) < py - 60 and trajectory[-1][1] > py + 50
    assert r[STATUS] == 0


def edge(core, ready, px, py, dx, dy):
    core.restore(ready)
    r = core.ram
    position(r, 0, px + dx, py + dy)
    core.run(8, Y)
    return r[STATUS] == 2


def boundaries(core, base, image, side):
    px, py = setup(core, base, image, 0x22, 0, side, 1-side)
    ready = core.freeze()
    # $02:9696 subtracts 2 from the stored punch X coordinate. The native
    # rectangle is 20 by 16 with inclusive edges, versus clip profile 01.
    left = -10 if side else 6
    xmin, xmax, ymin, ymax = left - 14, left + 18, -22, 15
    for dx, dy, expected in ((xmin-1, 0, False), (xmin, 0, True),
                              (xmax, 0, True), (xmax+1, 0, False),
                              (left, ymin-1, False), (left, ymin, True),
                              (left, ymax, True), (left, ymax+1, False)):
        assert edge(core, ready, px, py, dx, dy) == expected, (side, dx, dy, expected)


def moving_edge(core, base, image, side):
    r = core.ram
    px, py = setup(core, base, image, 0x24, 0, side, 1-side)
    if r[0x13] & 1 == 0:
        core.run()
    core.run(1, Y)
    ready = core.freeze()
    xmax = px + (8 if side else 24)
    # Cross exactly one inclusive edge on the only interaction frame run.
    for start, velocity, expected in ((xmax+1, -16, 2), (xmax, 16, 8)):
        core.restore(ready)
        position(r, 0, start, py)
        r[0xb6], r[0x14f8], r[0x157c] = velocity & 255, 0, int(velocity < 0)
        core.run()
        assert sprite_position(r)[0] == start + velocity // 16
        assert r[STATUS] == expected and r[0x149e] == 7


def same_side(core, base, image, number, player, side):
    px, py = setup(core, base, image, number, player, side, side)
    r = core.ram
    position(r, 0, px, py + 4)
    core.run(1, Y)
    core.run(12)
    assert r[STATUS] == 8 and r[0x1632] == side
    assert not any(r[POPUP:POPUP + 6]) and score(r, player) == 0


def vulnerable_contact(core, base, image, player, side):
    r = core.ram
    for koopa_side in (side, 1-side):
        px, py = setup(core, base, image, 0x24, player, side, koopa_side)
        r[0x1497] = 0
        position(r, 0, px, py + 8)
        ready = core.freeze()
        for button in (0, Y):
            core.restore(ready)
            core.run(1, button)
            core.run(4)
            if side == koopa_side:
                assert r[0x71] == 9 and r[STATUS] == 8  # Small player's death.
            else:
                assert r[0x71] == 0 and r[STATUS] == (2 if button else 8)


def contact_flash(core, base, image, atlas):
    r = core.ram
    px, py = setup(core, base, image, 0x24, 0, 0, 1)
    x, y = px + 8, py + 3
    position(r, 0, x, y)
    core.run(1, Y)
    for _ in range(2):
        core.run()
        if r[STATUS] == 2:
            break
    assert r[STATUS] == 2 and r[0x17cf] == 8 and r[0x2f1] == 240
    memory, colors = vram(core), snes_colors(core)
    for age in range(1, 9):
        core.run()
        assert r[0x17c3] == 2 and r[0x17cf] == 8 - age
        ox, oy = r[0x2f0], r[0x2f1]
        assert (ox, oy) == (x - read_word(r, 0x1a), y - read_word(r, 0x1c))
        assert all((r[0x203 + 4*i] & 0x30) == 0x20 for i in range(60, 64))
        native = crop(oam(r, memory, colors, range(60, 64)), ox, oy, 16, 16)
        phase = ((8 - age) >> 1) & 1
        assert native == crop(atlas, (32 + phase) * 16, 0, 16, 16)
    core.run()
    assert r[0x17c3] == 0 and r[0x2f1] == 240


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    args = parser.parse_args()
    image = cartridge_image(args.rom)
    core = Core(args.core, image)
    try:
        first = first_course(core)
        atlas = reward_sheet(core, image)
        enter_room(core, first, '101')
        core.run(24)
        for slot in range(12):
            core.ram[STATUS + slot] = 0
        base = core.freeze()
        contact_flash(core, base, image, atlas)
        for side in (0, 1):
            boundaries(core, base, image, side)
            moving_edge(core, base, image, side)
            for player in (0, 1):
                vulnerable_contact(core, base, image, player, side)
                for number in range(0x22, 0x26):
                    for parity in (0, 1):
                        strike(core, base, image, number, player, side, parity)
                    same_side(core, base, image, number, player, side)
                print('port', player+1, 'side', side, '4 Koopa types, both frame parities: opposite falls and earns 100, same stays')
        print('Both planes: inclusive edges and one-pixel misses on all four sides.')
        print('Both planes: a moving Koopa enters/exits the punch on its post-movement position.')
        print('Mario/Luigi: direct same-side contact hurts even while punching; opposite side is safe.')
        print('OAM: hit frame still climbing; next frame tiles 27/07 upside down with original plane priority.')
        print('Contact flash: eight frames in OAM 60..63 matched the extracted 16x16 RGBA atlas pixel for pixel.')
        print('Punch ages 1..7, hit on odd frames, status 02 until despawn, vx ±8/16, vy -80/16, gravity 3/16, maximum 64/16.')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
