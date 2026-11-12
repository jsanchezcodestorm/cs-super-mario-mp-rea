"""Extract and compare the transparent in-level status bar against the PAL SNES display."""
import sys
from pathlib import Path
from native_rooms import Core, first_course, cartridge_image
from boss_capture import LayerSwitch
from map_tiles import vram
from boss_pixels import png, oam, video_pixels
from hud_tiles import StatusPlane, canvas, crop, stamp, snes_colors, set_counters, render_counters


def reserve_tile(core):
    ram = core.ram
    entry = next(i for i in range(128) if ram[0x200+4*i] == 120 and ram[0x201+4*i] == 15)
    image = oam(ram,vram(core),snes_colors(core),[entry])
    return crop(image,120,15,16,16)


def compare_to_display(core,image):
    # The reference frontend shows only the status bar and OBJ, which includes
    # the reserve item. The level's native backdrop is visible through the bar.
    _,_,frame = video_pixels(core.frame)
    backdrop = frame[:4]
    expected = image[2]
    for i in range(256*32):
        at = i*4
        color = expected[at:at+4] if expected[at+3] else backdrop
        if frame[at:at+4] != color:
            raise AssertionError(f'Status bar differs at ({i%256}, {i//256}): {list(color)} vs. {list(frame[at:at+4])}')


def generate(library,image,output):
    output.mkdir(parents=True,exist_ok=True)
    core = Core(library,image)
    core.capture_video = True
    try:
        saved = first_course(core)
        layers = LayerSwitch(core)
        layers.show(0b01011)
        core.run(3)
        plane = StatusPlane(core)
        digits, dragon = plane.digits(image), plane.tile(0x3c2e)
        reserve = canvas(64,16)
        items = {}
        for item in range(1,5):
            core.ram[0xdc2] = item
            core.run(3)
            items[item] = reserve_tile(core)
            stamp(reserve,items[item],16*(item-1),0)
        star = canvas(64,16)
        phases = [None] * 4
        core.ram[0xdc2] = 3
        for _ in range(9):
            core.run()
            phase = (core.ram[0x13] >> 1) & 3
            phases[phase] = reserve_tile(core)
            stamp(star,phases[phase],16*phase,0)
        files = {'digits':digits, 'dragon':dragon, 'reserve':reserve, 'star':star}
        tests = [
            {'lives':5,'coins':0,'stars':0,'score':0,'timer':299,'dragon':0},
            {'lives':78,'coins':56,'stars':34,'score':123450,'timer':98,'dragon':3},
            {'lives':9,'coins':21,'stars':87,'score':9876540,'timer':7,'dragon':5}
        ]
        checked = 0
        for player,name in enumerate(['mario','luigi']):
            for example,counters in enumerate(tests):
                core.restore(saved)
                set_counters(core,player,counters)
                # Prepare a representative reserve item from the same palette.
                item = (1,2,4)[example]
                core.ram[0xdc2] = item
                core.run(3)
                base = StatusPlane(core).base_bar()
                files['base-'+name] = base
                composite = render_counters(base,digits,dragon,counters)
                stamp(composite,items[item],120,8)
                compare_to_display(core,composite)
                checked += 1
            core.ram[0xdc2] = 3
            core.run(3)
            for _ in range(8):
                set_counters(core,player,tests[-1])
                core.run()
                # NMI uploaded the OAM buffer computed in the preceding game tick.
                phase = ((core.ram[0x13]-1) >> 1) & 3
                composite = render_counters(base,digits,dragon,tests[-1])
                stamp(composite,phases[phase],120,8)
                compare_to_display(core,composite)
                checked += 1
        for name,buffer in files.items():
            (output/(name+'.png')).write_bytes(png(*buffer))
        print(f'HUD PAL: {checked} composizioni confrontate con Snes9x ({checked*256*32} pixel).')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    core_file, rom_file, generated = map(Path,sys.argv[1:])
    generate(core_file,cartridge_image(rom_file),generated/'hud')
