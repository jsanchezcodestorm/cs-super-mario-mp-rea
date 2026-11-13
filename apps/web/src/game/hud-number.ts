/** Native BG3 counters are right aligned and omit leading zeroes. */
export function hudNumber(
  ctx: CanvasRenderingContext2D, sheet: CanvasImageSource, value: number,
  x: number, y: number, places: number, sourceY: 0 | 8 | 16,
) {
  const digits = String(Math.min(Math.max(0, Math.trunc(value)), 10 ** places - 1));
  const start = x + (places - digits.length) * 8;
  const height = sourceY === 16 ? 16 : 8;
  for (let i = 0; i < digits.length; i++)
    ctx.drawImage(sheet, Number(digits[i]) * 8, sourceY, 8, height, start + i*8, y, 8, height);
}
