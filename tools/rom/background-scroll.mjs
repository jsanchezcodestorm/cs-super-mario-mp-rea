// $05:D796 reads the primary entrance's camera positions and the level's
// horizontal/vertical layer 2 scrolling modes. $00:A796 then establishes the
// vertical offset. $00:F79D combines the scroll ratio and offset each frame.
export function backgroundScroll(rom, id, vertical, isIntro) {
  if (isIntro) return { x: 0, y: 0, offsetY: 192 };
  const setting = rom.byte(0x05f000 + id) >> 4;
  const xMode = rom.byte(0x05d720 + setting);
  const yMode = rom.byte(0x05d710 + setting);
  const cameras = rom.byte(0x05f400 + id);
  const page = vertical ? (rom.byte(0x05f600 + id) & 31) * 256 : 0;
  const foregroundY = rom.byte(0x05d708 + ((cameras >> 2) & 3)) + page;
  const backgroundY = rom.byte(0x05d70c + (cameras & 3)) + (yMode === 3 ? 0 : page);
  const divisorAtEntry = [0, 1, 2, 8][yMode];
  return {
    x: [0, 1, 0.5][xMode],
    y: [0, 1, 0.5, 1 / 32][yMode],
    offsetY: backgroundY - (divisorAtEntry ? Math.floor(foregroundY / divisorAtEntry) : 0),
  };
}
