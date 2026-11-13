// E1 bank 05 prepares three VRAM uploads per effective frame. Bank 00 splits
// the upload at word $0800 into two rows of two characters (berry graphics).
export function characterUploadFrames(rom) {
  const frames = new Uint8Array(1024);
  for (let slot = 0; slot < 24; slot++) {
    const word = rom.word(0x05b94b + 2*slot);
    if (!word) continue;
    const character = word >> 4;
    const offsets = word === 0x800 ? [0,1,16,17] : [0,1,2,3];
    for (const offset of offsets) frames[character+offset] = Math.floor(slot/3);
  }
  return frames;
}

// For slots conditional on $14AF, the active ON/OFF state selects a second
// set of four source pointers in the already decompressed WRAM character bank.
export function onOffCharacters(rom) {
  const characters = new Map();
  for (let slot = 0; slot < 24; slot++) {
    if (rom.byte(0x05b97b + slot) !== 1 || rom.byte(0x05b98d + slot) !== 2) continue;
    const destination = rom.word(0x05b94b + slot*2) >> 4;
    const sources = Array.from({length:4}, (_,i) => rom.word(0x05b9a9 + (slot+0x26)*8 + 2*i) >> 5);
    for (let offset = 0; offset < 4; offset++) {
      characters.set(destination + offset, sources.map(character => character + offset));
    }
  }
  return characters;
}
