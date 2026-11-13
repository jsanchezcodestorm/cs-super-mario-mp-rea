import { execFileSync } from 'node:child_process';
import { decode, atlas, standardOamSlot } from './object-atlas.mjs';

export function capturePlayerFrames(output, runner, romFile, memFile, basePalette, rom) {
  const players = new Map();
  const flash = Array.from({ length: 4 }, (_, index) => {
    const address = rom.word(0x00e292 + (4 + index) * 2);
    return playerPalette(basePalette, i => rom.word(address + i * 2));
  });
  for (const [character, id] of ['mario', 'luigi'].entries())
    for (const [power, form] of ['small', 'super', 'cape', 'fire'].entries()) {
      const poses = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21,
        22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 40, 41, 60, 62];
      if (power === 0) poses.push(37, 61, 66, 70);
      else poses.push(67, 68, 69);
      if (form === 'fire') poses.push(63);
      if (form === 'cape') {
        poses.push(42, 43, 44, 45, 46, 47);
        const body = [...poses];
        for (let cape = 1; cape <= 10; cape++)
          for (const pose of body) poses.push(128 * cape + pose);
      }
      for (const pose of poses) {
        const result = execFileSync(runner, [
          romFile,
          memFile,
          String(character),
          String(power),
          String(pose),
        ]);
        const normal = playerPalette(basePalette, i => result.readUInt16LE(0x102a0 + i * 2));
        for (const [index, palette] of [normal, ...flash].entries()) {
          const image = decode(result.subarray(0, 0x2a0), result.subarray(0x2a0, 0x102a0), palette);
          const key = id + '/' + form + (index ? '-flash' + (index - 1) : '') + '/' + pose;
          if (!image) throw Error('Empty player frame ' + key);
          players.set(key, image);
        }
      }
    }
  atlas(output, players, 'actors');
}

function playerPalette(base, colorAt) {
  const palette = [...base];
  const expand = channel => (channel << 3) | (channel >> 2);
  for (let i = 0; i < 10; i++) {
    const color = colorAt(i);
    palette[134 + i] = (expand(color & 31) << 16) | (expand((color >> 5) & 31) << 8) | expand(color >> 10 & 31);
  }
  return palette;
}

export function parts(room, state, frames, rom) {
  const prefix = room.spriteTileset + ':';
  if (frames.has(prefix + 'block')) return;
  const standard = standardOamSlot(rom, state);
  // Extended sprite slot zero (DATA_02A153), player fireball slot eight
  // (DATA_029FA3+8) and fixed OAM addresses for Yoshi's tongue and wings.
  const extended = rom.byte(0x02a153) >> 2;
  const fireball = rom.byte(0x029fa3 + 8) >> 2;
  const definitions = [
    ['block', 0x40, 0x20, 16, standard],
    ['cloud-coin', 0xc2, 0x24, 16, rom.byte(0x02a153 + 7) >> 2],
    ...[0xa2, 0xa2, 0xa2, 0xa2, 0xa2, 0x62, 0x61, 0x61, 0x60].map((tile, i) =>
      ['brown-platform/' + i, tile, 0x31, 16, standard + 1 + i]),
    ...[0x62, 0x61, 0x60, 0xa2, 0xa2, 0xa2].map((tile, i) =>
      ['gray-platform/' + i, tile, 0x33, 16, standard + i]),
    ...Array.from({ length: 5 }, (_, segment) => [
      'tongue' + segment, segment === 4 ? 0x66 : 0x76, 0x29, 8, 3 + segment,
    ]),
    ...[0x02, 0x04, 0x06].map((palette, i) => ['berry' + (0x45 + i), 0x80, 0x20 | palette, 16, standard]),
    ['wing0', 0x5d, 0x26, 8, 62],
    ['wing1', 0xc6, 0x26, 16, 62],
    ['spit0', 0x04, 0x35, 16, extended],
    ['spit1', 0x2b, 0x35, 16, extended],
    ...[0, 0x40, 0x80, 0xc0].map((flip, i) => ['baseball' + i, 0xad, 0x39 | flip, 8, extended]),
    ['fireball0', 0x2c, 0x24, 8, fireball],
    ['fireball1', 0x2d, 0x24, 8, fireball],
    ['fireball2', 0x2c, 0xe4, 8, fireball],
    ['fireball3', 0x2d, 0xe4, 8, fireball],
  ];
  for (let id = 4; id < 8; id++) {
    const palette = 0x20 | [10, 8, 6, 4][id - 4];
    // Left-facing kicked shell OAM. The fourth phase mirrors tile $8a.
    for (const [f, tile] of [0x8c, 0x8a, 0x8e, 0x8a].entries())
      definitions.push(['shell' + id + '/' + f, tile, palette | (f === 3 ? 0x40 : 0), 16, standard + 2]);
  }
  for (const [name, tile, attrs, size, slot] of definitions) {
    const oam = Buffer.alloc(0x2a0);
    for (let slot = 0; slot < 128; slot++) oam[4 * slot + 1] = 0xf0;
    oam.set([96, 96, tile, attrs], slot * 4);
    oam[0x220 + slot] = size === 16 ? 2 : 0;
    const image = decode(oam, state.subarray(0x20000, 0x30000), room.spritePalette, size);
    if (image) frames.set(prefix + name, image);
  }
}
