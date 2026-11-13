"""Measure E1 growth, fire, cape, star and the death arc from sprite contacts."""
import json
import sys
from pathlib import Path
from native_rooms import Core, cartridge_image
from probe_shell_contacts import flat_room, position, spawn


def verify_item(core, image, floor, seat, sprite):
    core.restore(floor)
    r = core.ram
    r[0xdb3] = seat
    core.run(4)
    spawn(r, image, 4, sprite, 168)
    core.run(2)
    position(r, 4, 38, 296)
    samples = []
    for _ in range(52):
        core.run()
        samples.append((r[0x71], r[0x13e0], r[0x78], r[0xd82] + 256*r[0xd83]))
    if sprite == 0x74:
        assert [s[1] for s in samples[1:48:4]] == [0,61,0,61,0,61,70,61,70,61,70,61]
    if sprite in (0x75, 0x76):
        pointers = {int.from_bytes(image[0x629a+i*2:0x629c+i*2], 'little') for i in range(4)}
        assert {s[3] for s in samples[1:17]} == pointers
    if sprite == 0x77:
        assert [s[2] for s in samples[1:26]] == [127]*24 + [0]


def capture(library, image):
    core = Core(library, image)
    try:
        floor = flat_room(core)
        results = []
        for seat in (0, 1):
            for sprite in (0x74, 0x75, 0x76, 0x77):
                verify_item(core, image, floor, seat, sprite)
            core.restore(floor)
            r = core.ram
            r[0xdb3] = seat
            core.run(4)
            spawn(r, image, 4, 4, 168)
            core.run(2)
            position(r, 4, 38, 296)
            for _ in range(16):
                core.run()
                if r[0x71] == 9:
                    break
            else:
                raise RuntimeError('Koopa did not hit the player')
            start = r[0x96] + 256 * r[0x97]
            offsets = []
            for _ in range(200):
                if r[0x100] != 0x14:
                    break
                offsets.append(r[0x96] + 256 * r[0x97] - start)
                core.run()
            assert 185 <= len(offsets) <= 195 and min(offsets) == -70
            results.append(offsets)
        assert results[0] == results[1]
        return results[0]
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    library, rom, output = map(Path, sys.argv[1:])
    curve = capture(library, cartridge_image(rom))
    output.write_text(json.dumps(curve, separators=(',', ':')))
    print('Mario and Luigi PAL death arc:', len(curve), 'frames, apex', min(curve))
