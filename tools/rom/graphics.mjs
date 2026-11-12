import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// E1 stores LZ backreferences least-significant byte first.
export function decompressE1(rom, offset) {
  const output = [];
  let cursor = offset;
  function take() {
    if (cursor >= rom.length) throw new Error('Graphics stream ends prematurely');
    return rom[cursor++];
  }
  while (true) {
    const header = take();
    if (header === 255) return Buffer.from(output);
    const long = header >> 5 === 7;
    const command = long ? (header >> 2) & 7 : header >> 5;
    const count = (long ? ((header & 3) << 8) | take() : header & 31) + 1;
    if (output.length + count > 65536) throw new Error('Graphics stream exceeds a WRAM bank');
    const a = command === 0 ? 0 : take();
    const b = command === 2 || command >= 4 ? take() : 0;
    const source = a | (b << 8);
    for (let i = 0; i < count; i++) {
      if (command >= 4 && source + i >= output.length) throw new Error('Invalid graphics backreference');
      const value =
        command === 0
          ? take()
          : command === 1
            ? a
            : command === 2
              ? i % 2
                ? b
                : a
              : command === 3
                ? (a + i) & 255
                : output[source + i];
      output.push(value);
    }
  }
}

export function tilePixel(data, tile, x, y, bpp = 3) {
  const base = tile * bpp * 8;
  let index = 0;
  for (let plane = 0; plane < bpp; plane++) {
    const address = base + 16 * (plane >> 1) + (plane === 2 && bpp === 3 ? y : 2 * y + (plane & 1));
    index |= ((data[address] >> (7 - x)) & 1) << plane;
  }
  return index;
}

export function exportGraphics(rom, dir) {
  mkdirSync(dir, { recursive: true });
  for (let id = 0; id < 0x34; id++) {
    const addr =
      id === 0x32
        ? 0x088000
        : id === 0x33
          ? 0x08bfc0
          : rom.byte(0x00b9a6 + id) | (rom.byte(0x00b9d8 + id) << 8) | (rom.byte(0x00ba0a + id) << 16);
    const raw = decompressE1(rom.data, rom.offset(addr));
    writeFileSync(join(dir, id.toString(16).padStart(2, '0') + '.bin'), raw);
  }
}
