import { slopeMotion } from './slope-motion.mjs';

function inputSequence(rom, index) {
  const sequence = [];
  for (let p = 0x00c835 + index; rom.byte(p) !== 255; p += 2) {
    sequence.push([rom.byte(p), rom.byte(p + 1)]);
  }
  return sequence;
}

export function motionTables(rom) {
  const bytes = (address, count) => Array.from({ length: count }, (_, i) => rom.byte(address + i));
  const lineGuides = Array.from({ length: 32 }, (_, id) => {
    const address = 0x070000 | (rom.byte(0x07fc13 + id) << 8) | rom.byte(0x07fbf3 + id);
    return bytes(address, rom.byte(0x01dcdf + id));
  });
  return {
    lineGuides,
    slideTargets: bytes(0x07f659, 201).flatMap((traits, id) => traits & 4 ? [] : [id]),
    yoshiTraits: bytes(0x07f590, 201),
    capeTargets: bytes(0x07f3fe, 201).flatMap((traits, id) =>
      !(traits & 0x20) && !(rom.byte(0x07f4c7 + id) & 2) ? [id] : []),
    blockSnakePaths: [0x0393a4, 0x0393ef].map((address) => {
      const terminator = rom.data.indexOf(255, rom.offset(address));
      return bytes(address, terminator - rom.offset(address) + 1);
    }),
    entranceInputs: { onFoot: inputSequence(rom, 0), mounted: inputSequence(rom, 15) },
    slopes: { shape: bytes(0x00e54e, 106), steepShape: bytes(0x00e5b8, 106), heights: bytes(0x00e622, 528), motion: slopeMotion(rom) },
  };
}
