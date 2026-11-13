import { join } from 'node:path';
import { tilePixel } from '../../../tools/rom/graphics.mjs';
import { writePng } from '../../../tools/rom/png.mjs';

// GenerateTile($19) uploads 6×6 BG1 characters to the inner 48 pixels.
// Map16 remains climbable while the separate OBJ door is rotating.
export function captureOpenNetDoor(out, room, state, rom) {
  const pixels = Buffer.alloc(48 * 48 * 4), memory = state.subarray(0x20000, 0x30000);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const word = rom.word(0x00c29f + 2 * ((y >> 3) * 6 + (x >> 3)));
      const index = tilePixel(memory, word & 1023, word & 0x4000 ? 7 - (x & 7) : x & 7,
        word & 0x8000 ? 7 - (y & 7) : y & 7, 4);
      if (index) pixels.writeUInt32BE((room.spritePalette[((word >> 10) & 7) * 16 + index] * 256 + 255) >>> 0,
        4 * (48 * y + x));
    }
  writePng(join(out, room.atlas.replace('.png', '-net-door.png')), 48, 48, pixels);
}
