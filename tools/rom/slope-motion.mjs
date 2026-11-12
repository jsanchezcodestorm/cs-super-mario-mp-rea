// E1 bank 00 selects an acceleration word and a terminal speed byte for each
// Map16 slope profile. Keep units in pixels per PAL frame for the integrator.
export function slopeMotion(rom) {
  const speed = (address) => (rom.byte(address) << 24 >> 24) / 16;
  const acceleration = (address) => (rom.word(address) << 16 >> 16) / 4096;
  return Array.from({ length: 33 }, (_, profile) => {
    const type = rom.byte(0x00e4a9 + profile);
    const slope = rom.byte(0x00e52d + profile);
    const index = type >> 3;
    return {
      slide: slope ? [
        acceleration(0x00d2e5 + 0x76 + index * 2),
        speed(0x00d4d5 + 0x87 + index),
      ] : null,
      walk: [0, 1].map((right) => [
        acceleration(0x00d2e5 + type + right * 4),
        speed(0x00d4d5 + type + right),
      ]),
    };
  });
}
