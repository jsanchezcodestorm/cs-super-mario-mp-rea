export function drawMapPlayer(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#1b1720';
  ctx.fillRect(x - 4, y - 11, 8, 11);
  ctx.fillStyle = '#d52b32';
  ctx.fillRect(x - 4, y - 12, 8, 4);
  ctx.fillRect(x - 2, y - 14, 5, 3);
  ctx.fillStyle = '#ffd39e';
  ctx.fillRect(x - 2, y - 8, 5, 3);
  ctx.fillStyle = '#2169c5';
  ctx.fillRect(x - 3, y - 5, 6, 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 1, y - 8, 1, 1);
}
