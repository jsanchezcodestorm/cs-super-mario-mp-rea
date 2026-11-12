import { decode } from './object-atlas.mjs';

// CODE_01DF19 (E1 01:DF27) emits four 8×8 icon chars above a 16×16
// frame. Stop faces are indices 1, 4, and 7 in the nine-pose rotation.
export function captureBonusSlots(rom, room, state, frames) {
  const palette = room.spritePalette,
    vram = state.subarray(0x20000, 0x30000);
  for (let pose = 0; pose < 9; pose++) {
    const oam = Buffer.alloc(0x2a0);
    for (let i = 0; i < 128; i++) oam[i * 4 + 1] = 0xf0;
    const attr = 0x20 | rom.byte(0x01df15 + pose);
    for (let i = 0; i < 4; i++) {
      oam.set([96 + 8 * (i % 2), 96 + 8 * (i >> 1), rom.byte(0x01def1 + pose * 4 + i), attr], 4 * i);
    }
    oam.set([96, 96, 0xe4, attr | 1], 16);
    oam[0x224] = 2;
    const image = decode(oam, vram, palette, 16);
    if (!image) throw Error('Frame bonus vuoto ' + pose);
    frames.set('bonus/' + pose, image);
  }
}
