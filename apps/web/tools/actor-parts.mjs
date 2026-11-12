import { execFileSync } from 'node:child_process';
import { decode, atlas } from './object-atlas.mjs';

export function capturePlayerFrames(output, runner, romFile, memFile, basePalette) {
  const players = new Map();
  for (const [character, id] of ['mario', 'luigi'].entries())
    for (const [power, form] of ['small', 'super', 'cape', 'fire'].entries()) {
      const poses = [0, 1, 2, 4, 5, 6, 7, 8, 9, 11, 12, 15, 22, 23, 24, 25, 26, 27, 32, 39, 40, 62];
      if (power === 0) poses.push(37, 66);
      else poses.push(67, 68, 69);
      if (form === 'cape') poses.push(42, 45);
      for (const pose of poses) {
        const result = execFileSync(runner, [
          romFile,
          memFile,
          String(character),
          String(power),
          String(pose),
        ]);
        const palette = [...basePalette];
        for (let i = 0; i < 10; i++) {
          const value = result.readUInt16LE(0x102a0 + i * 2);
          const channels = [value & 31, (value >> 5) & 31, (value >> 10) & 31].map(
            (v) => (v << 3) | (v >> 2),
          );
          palette[134 + i] = (channels[0] << 16) | (channels[1] << 8) | channels[2];
        }
        const image = decode(result.subarray(0, 0x2a0), result.subarray(0x2a0, 0x102a0), palette);
        if (!image) throw Error('Empty player frame ' + id + '/' + form + '/' + pose);
        players.set(id + '/' + form + '/' + pose, image);
      }
    }
  atlas(output, players, 'actors');
}

export function parts(room, state, frames) {
  const prefix = room.spriteTileset + ':';
  if (frames.has(prefix + 'block')) return;
  const definitions = [
    ['block', 0x40, 0x20, 16],
    ['link', 0xa2, 0x31, 16],
    ['deck-left', 0x60, 0x31, 16],
    ['deck-center', 0x61, 0x31, 16],
    ['deck-right', 0x62, 0x31, 16],
    ['tongue-body', 0x76, 0x09, 8],
    ['tongue-tip', 0x66, 0x09, 8],
    ['wing0', 0x5d, 0x06, 8],
    ['wing1', 0xc6, 0x06, 16],
    ['spit0', 0x04, 0x35, 16],
    ['spit1', 0x2b, 0x35, 16],
    ...[0, 0x40, 0x80, 0xc0].map((flip, i) => ['baseball' + i, 0xad, 0x39 | flip, 8]),
    ['fireball0', 0x2c, 0x04, 8],
    ['fireball1', 0x2d, 0x04, 8],
    ['fireball2', 0x2c, 0xc4, 8],
    ['fireball3', 0x2d, 0xc4, 8],
  ];
  for (let id = 4; id < 8; id++) {
    for (let f = 0; f < 2; f++)
      definitions.push(['shell' + id + '/' + f, f ? 0x8c : 0x8e, [10, 8, 6, 4][id - 4], 16]);
  }
  for (const [name, tile, attrs, size] of definitions) {
    const oam = Buffer.alloc(0x2a0);
    for (let slot = 0; slot < 128; slot++) oam[4 * slot + 1] = 0xf0;
    oam.set([96, 96, tile, attrs], 0);
    oam[0x220] = size === 16 ? 2 : 0;
    const image = decode(oam, state.subarray(0x20000, 0x30000), room.spritePalette, size);
    if (image) frames.set(prefix + name, image);
  }
}
