import { roomKey } from './rooms.mjs';

export function roomDirectory(rom) {
  return Array.from({ length: 512 }, (_, id) => ({
    id,
    key: roomKey(id),
    layer1: rom.long(0x05e000 + 3 * id),
    layer2: rom.long(0x05e600 + 3 * id),
    sprites: 0x070000 | rom.word(0x05ec00 + 2 * id),
  }));
}

// Chocolate Island 2 selects these streams at runtime instead of looking them
// up by room ID. Entries 0, 3 and 6 already occur in the normal level table.
// Entry 2 repeats entry 1. The cartridge only replaces each pointer's low word.
export function chocolateIslandVariants(rom, directory) {
  const variants = [
    [1, 0xcd],
    [4, 0xcf],
    [5, 0xcf],
    [7, 0xce],
    [8, 0xce],
  ];
  return variants.map(([slot, id]) => {
    const base = directory[id];
    const pointer = (bank, table) => (bank & 0xff0000) | rom.word(table + 2 * slot);
    return {
      id,
      key: 'ci2-' + slot,
      layer1: pointer(base.layer1, 0x05db08),
      layer2: pointer(base.layer2, 0x05db2c),
      sprites: pointer(base.sprites, 0x05db1a),
    };
  });
}

// The entrance cutscenes have their own six-entry directory and sprite stream.
export function entranceScenes(rom) {
  return Array.from({ length: 6 }, (_, slot) => ({
    id: 0,
    key: 'intro-' + slot,
    layer1: rom.long(0x05d766 + slot * 3),
    layer2: rom.long(0x05d778 + slot * 3),
    sprites: 0x07c3ee,
    spawn: { x: 0x30, y: 0x100 + rom.byte(0x05d790 + slot) },
  }));
}

export function courseIntro(rom, id, tileset) {
  const translevel = id >= 0x100 ? id - 0x100 + 0x24 : id;
  if (rom.byte(0x05f600 + id) & 0x80) return undefined;
  let slot = translevel >= 0x52 ? 3 : -1;
  if (slot === -1) {
    for (let i = 4; i >= 0; i--) {
      if (rom.byte(0x05d760 + i) === tileset) {
        slot = i;
        break;
      }
    }
  }
  if (slot === -1) return undefined;
  if ([0x31, 0x32, 0x34, 0x35, 0x40].includes(translevel)) slot = 5;
  return 'intro-' + slot;
}
