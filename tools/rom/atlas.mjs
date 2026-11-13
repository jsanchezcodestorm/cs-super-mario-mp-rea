import { tilePixel } from './graphics.mjs';
import { characterUploadFrames, onOffCharacters } from './tile-animation.mjs';
import { writePng } from './png.mjs';

export function rgb15(word) {
  const expand = (n) => (n << 3) | (n >> 2);
  return (expand(word & 31) << 16) | (expand((word >> 5) & 31) << 8) | expand((word >> 10) & 31);
}

export function palette(ram) {
  return Array.from({ length: 256 }, (_, i) => rgb15(ram.readUInt16LE(0x703 + 2 * i)));
}

function quadrantRenderer(rom, state, colors, switches, goalMask = false) {
  const uploads = characterUploadFrames(rom);
  const memory = Array.from({ length: 4 }, (_, i) => state.subarray(0x20000 + i * 0x10000, 0x30000 + i * 0x10000));
  const flash = Array.from({ length: 8 }, (_, i) => rgb15(rom.word(0x00b61f + 2 * i)));
  const cache = new Map();
  return (word, frame, switched) => {
    const char = word & 1023;
    const row = ((word >> 10) & 7) * 16;
    // After the native tick, VRAM shows the upload prepared two effective frames
    // earlier. The flashing CGRAM color is read directly in NMI, one frame later.
    const phase = ((frame - 2 - uploads[char]) >> 3) & 3;
    const flashPhase = row === 0x60 ? ((frame - 1) >> 2) & 7 : 0;
    const alternate = switched && switches.get(char);
    const key = ((word * 4 + phase) * 8 + flashPhase) * 2 + Number(Boolean(alternate));
    if (cache.has(key)) return cache.get(key);
    const pixels = Buffer.alloc(8 * 8 * 4);
    const graphics = alternate ? state : memory[phase];
    const character = alternate ? alternate[phase] : char;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const value = tilePixel(graphics, character, word & 0x4000 ? 7 - x : x, word & 0x8000 ? 7 - y : y, 4);
        if (!value) continue;
        const index = row + value;
        // EndLevelTimer fades palette entries 1..7 in BG rows 0..7, and 0D..0F.
        if (goalMask && (value <= 7 || (index >= 13 && index <= 15))) continue;
        const rgb = goalMask ? 0xffffff : index === 0x64 ? flash[flashPhase] : colors[index];
        pixels.writeUInt32BE((rgb * 256 + 255) >>> 0, (y * 8 + x) * 4);
      }
    }
    cache.set(key, pixels);
    return pixels;
  };
}

function renderTile(words, frame, quadrant, switched) {
  const pixels = Buffer.alloc(16 * 16 * 4);
  for (let i = 0; i < words.length; i++) {
    const part = quadrant(words[i], frame, switched);
    for (let y = 0; y < 8; y++) {
      const offset = (((i & 1) * 8 + y) * 16 + (i >> 1) * 8) * 4;
      part.copy(pixels, offset, y * 32, (y + 1) * 32);
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
  const switches = onOffCharacters(rom);
  const quadrant = quadrantRenderer(rom, state, colors, switches);
  for (let id = 0; id < 1024; id++) {
    const pointer = id < 512 ? state.readUInt16LE(0xfbe + id * 2) : 0x9100 + (id - 512) * 8;
    const words = pointer < 0x8000 ? [] : Array.from({ length: 4 }, (_, q) => rom.word(0xd0000 | (pointer + 2 * q)));
    const frames = new Map();
    const modes = words.some(word => switches.has(word & 1023)) ? [false, true] : [false];
    for (const switched of modes) {
      const indices = [];
      for (let phase = 0; phase < 32; phase++) {
        const pixels = renderTile(words, phase, quadrant, switched);
        const key = pixels.toString('latin1');
        if (!frames.has(key)) {
          if (!switched && phase === 0) {
            tiles[id] = pixels;
            frames.set(key, id);
          } else frames.set(key, tiles.push(pixels) - 1);
        }
        indices.push(frames.get(key));
      }
      if (indices.some(index => index !== id)) animated[id + (switched ? 1024 : 0)] = indices;
    }
  }
  writeTileSheet(path, tiles);
  return animated;
}

// Tile slots match the ordinary atlas including its deduplicated animation frames.
export function goalPaletteRects(rom, state, animated) {
  const quadrant = quadrantRenderer(rom, state, [], onOffCharacters(rom), true);
  const tiles = new Array(1024);
  for (let id = 0; id < 1024; id++) {
    const pointer = id < 512 ? state.readUInt16LE(0xfbe + id * 2) : 0x9100 + (id - 512) * 8;
    const words = pointer < 0x8000 ? [] : Array.from({ length: 4 }, (_, q) => rom.word(0xd0000 | (pointer + 2 * q)));
    for (const switched of [false, true]) {
      const track = animated[id + (switched ? 1024 : 0)];
      if (!track && switched) continue;
      for (const [phase, slot] of (track ?? [id]).entries()) {
        if (!tiles[slot]) tiles[slot] = renderTile(words, phase, quadrant, switched);
      }
    }
  }
  const rects = [];
  tiles.forEach((pixels, slot) => {
    let previous = new Map();
    const left = (slot % 32) * 16, top = (slot >> 5) * 16;
    for (let y = 0; y < 16; y++) {
      const current = new Map();
      for (let x = 0; x < 16;) {
        if (!pixels[(y * 16 + x) * 4 + 3]) { x++; continue; }
        const start = x++;
        while (x < 16 && pixels[(y * 16 + x) * 4 + 3]) x++;
        const key = start * 17 + x;
        const rect = previous.get(key) ?? [left + start, top + y, x - start, 0];
        if (!rect[3]) rects.push(rect);
        rect[3]++;
        current.set(key, rect);
      }
      previous = current;
    }
  });
  return rects;
}
