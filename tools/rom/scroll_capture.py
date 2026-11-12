"""Observe the cartridge's layer 1 scroll path for rooms with scroll controllers."""
import json
import sys
from pathlib import Path
from native_rooms import Core, first_course, enter_room, cartridge_image


def word(ram,index):
    return ram[index]+256*ram[index+1]


def write(ram,index,value):
    ram[index]=value&255
    ram[index+1]=(value>>8)&255


def capture(core,base,room):
    enter_room(core,base,room['id'])
    ram=core.ram
    points=[]
    for frame in range(18000):
        x,y=word(ram,0x1a),word(ram,0x1c)
        if frame%4==0:
            points.append([x,y])
        # Keep the observer within the moving viewport while the native scroll
        # command runs independently in bank 05. Preserve sprite activation.
        write(ram,0x94,x+96)
        write(ram,0x96,y+80)
        ram[0x71]=ram[0x9d]=ram[0x7b]=ram[0x7d]=0
        ram[0x1497]=120
        ram[0xf31]=9
        if len(points)>150 and points[-1]==points[-150] and points[-1][0]>0:
            break
        core.run()
        if ram[0x100]!=0x14:
            raise RuntimeError('left gameplay while observing '+room['id'])
    if points[-1][0] < 128:
        raise RuntimeError('scroll controller did not move in '+room['id'])
    while len(points)>1 and points[-1]==points[-2]:
        points.pop()
    return points


def generate(library,rom,output):
    data=cartridge_image(rom)
    campaign_file=output/'content.json'
    campaign=json.loads(campaign_file.read_text())
    core=Core(library,data)
    base=first_course(core)
    for room in campaign['levels'].values():
        if any(s['spriteId'] in (0xe8,0xf3) for s in room['sprites']):
            points=capture(core,base,room)
            print('Auto-scroll',room['id'],points[0],points[-1],len(points),flush=True)
            room['autoscroll']=points
    core.lib.retro_unload_game()
    core.lib.retro_deinit()
    temp=campaign_file.with_suffix('.pending.json')
    temp.write_text(json.dumps(campaign,separators=(',',':'),ensure_ascii=False))
    temp.replace(campaign_file)


if __name__=='__main__':
    generate(*map(Path,sys.argv[1:]))
