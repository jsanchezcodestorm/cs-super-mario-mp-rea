import { keyholeFrame, type GameState } from '@smw/core';
import type { ObjectPlanes } from './object-planes';
import { HEIGHT, WIDTH, type Camera } from './terrain-view';

type Finish = NonNullable<GameState['keyholeFinish']>;

/** HDMA masks the backgrounds inside the shape. On contraction it also hides OBJ outside. */
export function drawKeyhole(ctx: CanvasRenderingContext2D, finish: Finish, tick: number,
  camera: Camera, profile: number[], objects: ObjectPlanes) {
  const { size, darken } = keyholeFrame(finish.tick, tick);
  const cx = Math.round(finish.x - camera.x), bottom = Math.round(finish.y - camera.y);
  if (size > 0) {
    const shape = new Path2D();
    for (let y = Math.max(0, bottom - size + 1); y < Math.min(HEIGHT, bottom); y++) {
      const half = profile[Math.floor((bottom - y) * 128 / size)] * size >> 8;
      shape.rect(cx - half, y, 2 * half + 1, 1);
    }
    ctx.save();
    ctx.clip(shape);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (let priority = 0; priority < 4; priority++) objects.paint(ctx, priority);
    ctx.restore();
  }
  if (darken) {
    ctx.save();
    ctx.globalAlpha = darken / 15;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }
}
