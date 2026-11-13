"""Capture the goal's BG3 stripe art and the PAL counter upload timing for both seats."""
import json
import struct
import sys
from pathlib import Path

from native_rooms import Core, cartridge_image, write_word
from probe_shell_contacts import flat_room, spawn
from hud_tiles import StatusPlane, canvas, stamp, crop
from boss_pixels import png
from goal_coin_art import goal_coin_sheet
from goal_star_art import export_goal_stars


def word(plane, col, row):
    return struct.unpack_from('<H', plane.memory, plane.map + 2*(32*row + col))[0]


def field(plane, start, row, size):
    words = [word(plane, start+i, row) & 1023 for i in range(size)]
    return sum(n*10**(size-1-i) for i,n in enumerate(words) if n < 10)


def panel_art(plane, fixed=False):
    # BG3 rows 1..28 appear on scanlines 0..223. Leave numeric fields dynamic.
    art = canvas(112, 72)
    for row in range(8, 17):
        for col in range(9, 23):
            timer_or_score = row == 13 and (10 <= col <= 12 or 17 <= col <= 21)
            stars = row in (15, 16) and col in (19, 20)
            if not (fixed and (timer_or_score or stars)):
                stamp(art, plane.tile(word(plane, col, row)), 8*(col-9), 8*(row-8))
    return art


def check_counters(art, digits, age, stars, observed):
    elapsed = max(0, age-(282 if stars else 242))
    hundreds = min(149, elapsed)
    remaining = max(0, 14950 - 100*hundreds - 10*(elapsed-hundreds))
    bonus = stars and age >= 202
    screen = canvas(112,72)
    stamp(screen, crop(art, 0, 0, 112, 72 if bonus else 48), 0, 0)
    fields = [(299, 8, 40, 3, 0), (remaining, 64, 40, 5, 0)]
    if bonus:
        fields.append((max(0, 21 - (elapsed+2)//4), 80, 56, 2, 16))
    for value,x,y,places,source_y in fields:
        for i,digit in enumerate(str(value).rjust(places)):
            if digit.isdigit():
                stamp(screen,crop(digits,int(digit)*8,source_y,8,16 if source_y else 8),x+i*8,y)
    assert screen[2] == observed[2], ('counter raster', age, stars)


def sample(core, rom, base, seat, stars):
    core.restore(base)
    ram = core.ram
    ram[0xdb3] = seat
    spawn(ram, rom, 0, 0x7b, 100)
    core.run(10)
    write_word(ram, 0x94, 99)
    write_word(ram, 0x96, 288)
    first = {}
    reference = {}
    for age in range(450):
        core.run()
        if age == 0:
            assert ram[0x1493] == 255
            ram[0x1900] = stars  # Native number of tape stars is packed BCD.
        if age < 157:
            continue
        plane = StatusPlane(core)
        panel = word(plane, 9, 10) & 1023 == 12
        bonus = word(plane, 10, 16) & 1023 == 11
        remaining = field(plane, 17, 13, 5)
        if panel:
            first.setdefault('header', age)
        if bonus:
            first.setdefault('bonus', age)
        if panel and remaining < 14950:
            first.setdefault('count', age)
        if panel and remaining == 0:
            first.setdefault('zero', age)
        if age == 220:
            art = panel_art(plane, fixed=True)
            digits = plane.digits(rom)
        if age in (161, 202, 243, 282, 283, 284, 285, 289, 399, 436):
            reference[age] = panel_art(plane)
    for age, observed in reference.items():
        check_counters(art, digits, age, stars, observed)
    print('seat', seat+1, 'stars', int(f'{stars:x}'), 'BG3 frames', first, 'pixel comparisons', len(reference)*112*72)
    assert first['header'] < 164 and 240 <= first['count'] <= 286 and first['zero'] < 445
    return art


def generate(library, rom, output, catalog=None):
    # ColorFadeTimer selects one bit per step from two E1 words per RGB5 value.
    words = struct.unpack_from('<64H', rom, 0x2e7e)
    levels = [[0] * 32]
    for step in range(32):
        levels.append([n + ((words[2*c + step//16] >> (15-step%16)) & 1) for c,n in enumerate(levels[-1])])
    assert levels[-1] == list(range(32))
    window = list(rom[0x4b05:0x4b05+129])  # E1 $00:CB05 HDMA quarter-circle table.
    assert window[0] == 255 and window[-1] == 0
    keyhole = list(rom[0x4b86:0x4b86+128])  # E1 $00:CB86, upper half of the keyhole.
    (output / 'goal-fade.json').write_text(json.dumps({'levels': levels, 'window': window, 'keyhole': keyhole}, separators=(',', ':')))
    core = Core(library, rom)
    try:
        base = flat_room(core)
        if catalog is not None:
            export_goal_stars(core, rom, output, catalog)
        (output / 'goal-coins.png').write_bytes(png(*goal_coin_sheet(core, rom)))
        for seat, name in enumerate(('mario', 'luigi')):
            art = sample(core, rom, base, seat, 0x21)
            (output / ('course-'+name+'.png')).write_bytes(png(*art))
        sample(core, rom, base, 0, 0)
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    library, cartridge, output, *catalog = map(Path, sys.argv[1:])
    output.mkdir(parents=True, exist_ok=True)
    generate(library, cartridge_image(cartridge), output, *catalog)
