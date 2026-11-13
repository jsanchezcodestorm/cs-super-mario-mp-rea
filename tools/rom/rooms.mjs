import { rgb15, palette } from './atlas.mjs';
import { backgroundScroll } from './background-scroll.mjs';
export const roomKey = (id) => id.toString(16).padStart(3, '0');

function spriteList(rom, id, vertical, address) {
  const sprites = [];
  let p = address;
  for (p++; rom.byte(p) !== 255; p += 3) {
    const a = rom.byte(p),
      b = rom.byte(p + 1);
    const along = ((b & 15) | ((a & 2) << 3)) * 256 + (b & 0xf0);
    const across = (a & 0xf0) | ((a & 1) << 8);
    sprites.push({
      x: vertical ? across : along,
      y: vertical ? along : across,
      spriteId: rom.byte(p + 2),
      extra: (a >> 2) & 3,
    });
    if (sprites.length > 255) throw new Error('Invalid sprite stream in room ' + roomKey(id));
  }
  return sprites;
}

function entrance(rom, target, secondary) {
  const isSecondary = secondary !== undefined;
  const yIndex = rom.byte(isSecondary ? 0x5fa00 + secondary : 0x5f000 + target) & 15;
  const xIndex = isSecondary ? rom.byte(0x5fc00 + secondary) >> 5 : rom.byte(0x5f200 + target) & 7;
  const vertical = (rom.byte(0x5f600 + target) & 0x20) !== 0;
  const screen = rom.byte(isSecondary ? 0x5fc00 + secondary : 0x5f600 + target) & 31;
  let x = rom.byte(0x5d750 + xIndex) + 256 * rom.byte(0x5d758 + xIndex);
  let y = rom.byte(0x5d730 + yIndex) + 256 * rom.byte(0x5d740 + yIndex);
  if (vertical) y = (y & 255) + screen * 256;
  else x = (x & 255) + screen * 256;
  const type = isSecondary ? rom.byte(0x05fe00 + secondary) & 7 : (rom.byte(0x05f200 + target) >> 3) & 7;
  const pipe = [undefined, 'left', 'right', 'up', 'down', undefined, undefined, 'down'][type];
  return pipe ? { x, y, pipe } : { x, y };
}

function exits(rom, id, layer1) {
  const exits = [];
  for (let p = layer1 + 5; rom.byte(p) !== 255; ) {
    const a = rom.byte(p),
      b = rom.byte(p + 1),
      settings = rom.byte(p + 2);
    p += 3;
    if (((a & 0x60) | (b & 0xf0) | settings) !== 0) continue;
    const raw = (id & 0x100) | rom.byte(p++);
    const secondary = Boolean(b & 2);
    const target = secondary ? (id & 0x100) | rom.byte(0x5f800 + raw) : raw;
    exits.push({
      screen: a & 31,
      target: roomKey(target),
      spawn: entrance(rom, target, secondary ? raw : undefined),
    });
  }
  return exits;
}

export function roomEntrances(rom, { id, layer1, spawn }) {
  return { spawn: spawn ?? entrance(rom, id), exits: exits(rom, id, layer1) };
}

function screenLayer(ram, width, height, vertical, start = 0xc800) {
  return Array.from({ length: width * height }, (_, i) => {
    const x = i % width,
      y = Math.floor(i / width);
    const addr =
      start +
      (vertical
        ? (y >> 4) * 512 + (x >> 4) * 256 + (y & 15) * 16 + (x & 15)
        : (x >> 4) * 432 + y * 16 + (x & 15));
    return ram[addr] | (ram[addr + 65536] << 8);
  });
}

function layer2(ram, rom, ptr, mode, width, height) {
  if (ptr >> 16 === 255) {
    const tiles = Array.from({ length: 32 * 27 }, (_, i) => {
      const x = i % 32,
        y = Math.floor(i / 32),
        offset = (x >> 4) * 432 + y * 16 + (x & 15);
      return 512 + ram[0xb900 + offset] + 256 * ram[0xbd00 + offset];
    });
    return { width: 32, height: 27, repeat: true, tiles };
  }
  if ([0, 9, 10, 11, 12, 13, 14, 16, 17, 30].includes(mode)) return undefined;
  const ptrTable = rom.word(0xbeab);
  const pages = rom.word(ptrTable + mode * 2);
  if (pages < 0x8000) return undefined;
  const start = rom.long(pages) & 0xffff;
  const vertical = Boolean(ram[0x5b] & 2);
  return { width, height, repeat: false, tiles: screenLayer(ram, width, height, vertical, start) };
}

export function tideSetting(rom, id, tileset) {
  const layer3 = rom.byte(0x05f200 + id) >> 6;
  if (!layer3) return undefined;
  const type = rom.byte(0x009f8f + tileset * 3 + layer3 - 1);
  return type === 1 || type === 2 ? type : undefined;
}

export function decodeRoom(rom, { id, key, layer1: p1, layer2: p2, sprites, spawn }, state) {
  const mode = state[0x1925],
    vertical = Boolean(state[0x5b] & 1);
  const screens = state[0x5d];
  const width = vertical ? 32 : screens * 16,
    height = vertical ? screens * 16 : 27;
  const tiles = screenLayer(state, width, height, vertical);
  const bar = tiles.indexOf(0x38);
  const header = Array.from(rom.data.subarray(rom.offset(p1), rom.offset(p1) + 5));
  const atlas = 'tiles/' + [state[0x1931], state[0x192d], state[0x1930], state[0x192e]].join('-') + '.png';
  const bg = layer2(state, rom, p2, mode, width, height);
  if (bg?.repeat) bg.scroll = backgroundScroll(rom, id, vertical, Boolean(spawn));
  return {
    id: key,
    width,
    height,
    vertical,
    mode,
    tiles,
    tileset: state[0x1931],
    spriteTileset: state[0x192b],
    music: (header[2] >> 4) & 7,
    timeLimit: [0, 200, 300, 400][header[3] >> 6],
    tide: !spawn ? tideSetting(rom, id, state[0x1931]) : undefined,
    water: ((rom.byte(0x5f200 + id) >> 3) & 7) === 7,
    ...roomEntrances(rom, { id, layer1: p1, spawn }),
    sprites: spriteList(rom, id, vertical, sprites),
    checkpoint: bar < 0 ? undefined : { x: 16 * (bar % width), y: 16 * Math.floor(bar / width) },
    background: bg,
    layer2: state[0x5b] & 0x80 ? bg?.tiles : undefined,
    backgroundColor: '#' + rgb15(state.readUInt16LE(0x701)).toString(16).padStart(6, '0'),
    spritePalette: palette(state),
    atlas,
    specialMode7: [9, 11, 16].includes(mode),
  };
}
