"""Compare exported Map16 cells to an independent full SNES execution."""
import argparse
import json
from pathlib import Path
from native_rooms import Core, cartridge_image, first_course, enter_room


def native_grid(ram, room, start):
    cells = []
    width = room['width']
    for i in range(width * room['height']):
        x, y = i%width, i//width
        if room['vertical']:
            position = (y//16)*512 + (x//16)*256 + (y%16)*16 + x%16
        else:
            position = (x//16)*432 + y*16 + x%16
        address = start + position
        cells.append(ram[address] + 256*ram[0x10000+address])
    return cells


def native_background(ram):
    cells = []
    for y in range(27):
        for x in range(32):
            address = 0xb900 + (x//16)*432 + y*16 + x%16
            cells.append(512 + ram[address] + 256*ram[0x400+address])
    return cells


def equal_grid(room_id, name, expected, native):
    if expected != native:
        for i, (rendered, original) in enumerate(zip(expected,native)):
            if rendered != original:
                raise AssertionError(f'{room_id} {name}, cella {i}: {rendered:#05x} / SNES {original:#05x}')
        raise AssertionError(f'{room_id} {name}: lunghezze {len(expected)} e {len(native)}')
    return len(expected)


def compare(core, room):
    ram = bytes(core.ram)
    if room['mode'] != ram[0x1925] or room['tileset'] != ram[0x1931]:
        raise AssertionError('Il caricatore originale ha selezionato un altro tileset o modalità per '+room['id'])
    count = equal_grid(room['id'], 'layer 1', room['tiles'], native_grid(ram,room,0xc800))
    if 'layer2' in room:
        start = 0xe400 if room['vertical'] else 0xe300
        equal_grid(room['id'], 'layer 2', room['layer2'], native_grid(ram,room,start))
    if room.get('background',{}).get('repeat'):
        equal_grid(room['id'], 'sfondo', room['background']['tiles'], native_background(ram))
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('core', type=Path)
    parser.add_argument('rom', type=Path)
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--all-rooms', action='store_true')
    args = parser.parse_args()
    levels = json.loads(args.manifest.read_text())['levels']
    core = Core(args.core.resolve(), cartridge_image(args.rom))
    try:
        base = first_course(core)
        count = compare(core,levels['105'])
        print(f"Yoshi’s Island 1: {count} celle di primo piano e 864 di sfondo verificate.")
        if args.all_rooms:
            rooms = [r for r in levels.values() if len(r['id']) == 3 and not r['specialMode7']]
            count = 0
            for room in rooms:
                enter_room(core,base,room['id'])
                count += compare(core,room)
            layers = sum('layer2' in r for r in rooms)
            scenery = sum(bool(r.get('background',{}).get('repeat')) for r in rooms)
            print(f'{len(rooms)} stanze verificate, {count} celle di primo piano, {layers} secondi layer e {scenery} sfondi.')
    finally:
        core.lib.retro_unload_game()
        core.lib.retro_deinit()


if __name__ == '__main__':
    main()
