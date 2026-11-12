import { tilePixel } from './graphics.mjs';
import { writePng } from './png.mjs';

export function rgb15(word) {
  const expand = (n) => (n << 3) | (n >> 2);
  return (expand(word & 31) << 16) | (expand((word >> 5) & 31) << 8) | expand((word >> 10) & 31);
}

export function palette(ram) {
  return Array.from({ length: 256 }, (_, i) => rgb15(ram.readUInt16LE(0x703 + 2 * i)));
}

function renderTile(rom, pointer, vram, colors) {
  const pixels = Buffer.alloc(16 * 16 * 4);
  if (pointer < 0x8000) return pixels;
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const descriptor = rom.word(0xd0000 | (pointer + 2 * quadrant));
    const character = descriptor & 0x3ff;
    const paletteBase = ((descriptor >> 10) & 7) * 16;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const index = tilePixel(
          vram,
          character,
          descriptor & 0x4000 ? 7 - x : x,
          descriptor & 0x8000 ? 7 - y : y,
          4,
        );
        if (!index) continue;
        const destX = (quadrant >> 1) * 8 + x;
        const destY = (quadrant & 1) * 8 + y;
        const offset = (destY * 16 + destX) * 4;
        const rgb = colors[paletteBase + index];
        pixels.writeUInt32BE((rgb * 256 + 255) >>> 0, offset);
      }
    }
  }
  return pixels;
}

function writeTileSheet(path, tiles) {
  const columns = 32;
  const width = 16 * columns;
  const height = 16 * Math.ceil(tiles.length / columns);
  const output = Buffer.alloc(width * height * 4);
  tiles.forEach((pixels, index) => {
    for (let y = 0; y < 16; y++) {
      const dest = ((Math.floor(index / columns) * 16 + y) * width + (index % columns) * 16) * 4;
      pixels.copy(output, dest, y * 64, (y + 1) * 64);
    }
  });
  writePng(path, width, height, output);
}

export function exportAtlas(path, rom, state, colors) {
  const tiles = new Array(1024);
  const animated = {};
  const frameMemory = Array.from({ length: 4 }, (_, i) =>
    state.subarray(0x20000 + i * 0x10000, 0x30000 + i * 0x10000),
  );
  for (let id = 0; id < 1024; id++) {
    const pointer = id < 512 ? state.readUInt16LE(0xfbe + id * 2) : 0x9100 + (id - 512) * 8;
    const frames = frameMemory.map((vram) => renderTile(rom, pointer, vram, colors));
    tiles[id] = frames[0];
    const indices = [id];
    for (let phase = 1; phase < 4; phase++) {
      const existing = frames.findIndex((frame) => frame.equals(frames[phase]));
      indices.push(existing < phase ? indices[existing] : tiles.push(frames[phase]) - 1);
    }
    if (indices.some((index) => index !== id)) animated[id] = indices;
  }
  writeTileSheet(path, tiles);
  return animated;
}
