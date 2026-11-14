export type Nameplate = { id: string; nickname: string; x: number; top: number };

type PlacedLabel = { left: number; right: number; top: number; bottom: number };

export function drawPlayerNameplates(ctx: CanvasRenderingContext2D, entries: Nameplate[]) {
  ctx.save();
  ctx.font = '7px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2;
  const placed: PlacedLabel[] = [];
  const ordered = [...entries].sort((a, b) => a.x - b.x || a.top - b.top || a.id.localeCompare(b.id));
  for (const entry of ordered) {
    const width = Math.min(ctx.canvas.width - 4, ctx.measureText(entry.nickname).width + 6);
    const half = width / 2;
    const center = Math.max(2 + half, Math.min(ctx.canvas.width - 2 - half, entry.x));
    let top = Math.max(1, entry.top - 10);
    const collides = (candidate: PlacedLabel) => placed.some((other) =>
      candidate.left < other.right && candidate.right > other.left &&
      candidate.top < other.bottom && candidate.bottom > other.top);
    let candidate = { left: center - half, right: center + half, top, bottom: top + 9 };
    while (collides(candidate) && top > 10) {
      top -= 9;
      candidate = { ...candidate, top, bottom: top + 9 };
    }
    if (collides(candidate)) {
      top = Math.min(ctx.canvas.height - 10, entry.top + 2);
      candidate = { ...candidate, top, bottom: top + 9 };
      while (collides(candidate) && candidate.bottom < ctx.canvas.height - 1) {
        candidate.top += 9;
        candidate.bottom += 9;
      }
    }
    placed.push(candidate);
    ctx.fillStyle = '#102024e8';
    ctx.fillRect(candidate.left, candidate.top, candidate.right - candidate.left, 9);
    ctx.strokeStyle = '#102024';
    ctx.strokeText(entry.nickname, center, top + 4.5, ctx.canvas.width - 6);
    ctx.fillStyle = '#fff7c2';
    ctx.fillText(entry.nickname, center, top + 4.5, ctx.canvas.width - 6);
  }
  ctx.restore();
}
