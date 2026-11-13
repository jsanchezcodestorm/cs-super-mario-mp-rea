// Each bit describes one 8x8 Map16 quadrant in TL, BL, TR, BR order.
export function tilePriorities(rom, state) {
  return Array.from({ length: 1024 }, (_, id) => {
    const pointer = id < 512 ? state.readUInt16LE(0xfbe + id * 2) : 0x9100 + (id - 512) * 8;
    if (pointer < 0x8000) return 0;
    let mask = 0;
    for (let part = 0; part < 4; part++) {
      if (rom.word(0x0d0000 | (pointer + 2 * part)) & 0x2000) mask |= 1 << part;
    }
    return mask;
  });
}

export function screenRouting(rom) {
  return Array.from({ length: 32 }, (_, mode) => ({
    main: rom.byte(0x05845c + mode), sub: rom.byte(0x05847c + mode),
  }));
}
