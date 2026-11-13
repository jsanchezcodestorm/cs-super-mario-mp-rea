import { goalWalkFrame, type GameState, type PlayerState } from '@smw/core';
import type { Camera } from './terrain-view';
import { WIDTH, HEIGHT } from './terrain-view';

export function drawGoalIris(ctx: CanvasRenderingContext2D, state: GameState, focus: PlayerState, camera: Camera, window: number[]) {
  if (!state.goalWalk) return;
  const radius = goalWalkFrame(state.goalWalk, state.tick).iris;
  if (radius === undefined) return;
  const cx = Math.round(focus.x + focus.width / 2 - camera.x);
  const cy = Math.round(focus.y + focus.height - (focus.form === 'small' ? 8 : 16) - camera.y);
  ctx.fillStyle = '#000';
  for (let y = 0; y < HEIGHT; y++) {
    const dy = y < cy ? cy - y : y - cy + 1;
    if (dy >= radius) ctx.fillRect(0, y, WIDTH, 1);
    else {
      const half = (window[Math.floor(dy * 128 / radius)] * radius) >> 8;
      ctx.fillRect(0, y, Math.max(0, cx - half), 1);
      ctx.fillRect(cx + half + 1, y, Math.max(0, WIDTH - cx - half - 1), 1);
    }
  }
}
