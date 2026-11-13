import type { EntityState } from '@smw/core';
import type { DrawActor } from './platform-view';

/** Render the ball at its collision position and connect it to its fixed pivot. */
export function drawBallAndChain(e: EntityState, tileset: number, ballFrame: string, draw: DrawActor) {
  const motion = e.hazardMotion;
  if (motion?.type !== 'ball-and-chain') return false;

  const pivotX = e.origin.x + 8;
  const pivotY = e.origin.y + 8;
  const ballX = motion.ball.x + e.width / 2;
  const ballY = motion.ball.y + e.height / 2;
  const length = Math.hypot(ballX - pivotX, ballY - pivotY);
  const links = Math.ceil(length / 8);
  for (let link = 1; link < links; link++) {
    const ratio = link / links;
    const x = pivotX + (ballX - pivotX) * ratio;
    const y = pivotY + (ballY - pivotY) * ratio;
    draw(e.id + '-chain-' + link, tileset + ':gray-platform/0', x, y + 8, false, 1, 'creatures');
  }
  draw(e.id + '-ball', ballFrame, ballX, ballY + 14, false, 1, 'creatures');
  return true;
}
