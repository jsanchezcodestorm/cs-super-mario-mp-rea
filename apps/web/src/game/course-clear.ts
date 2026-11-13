import type Phaser from 'phaser';
import { goalWalkFrame, type GameState, type PlayerId } from '@smw/core';
import { hudNumber } from './hud-number';

type Walk = NonNullable<GameState['goalWalk']>;

export function goalCounters(walk: Pick<Walk, 'scoreBefore' | 'stars' | 'coins'>, age: number, time: number) {
  // E1 uploads the header at 161 PAL, the optional star stripe at 202, and
  // starts uploading the declining score at 243 or 283 according to that stripe.
  const elapsed = Math.max(0, age - (walk.stars ? 282 : 242));
  const total = time * 50;
  function balance(steps: number) {
    const hundreds = Math.min(Math.floor(total / 100), steps);
    return Math.max(0, total - 100 * hundreds - 10 * (steps - hundreds));
  }
  // The status bar upload trails the stripe update by one PAL frame.
  const stars = Math.max(0, walk.stars - Math.floor((elapsed + 2) / 4));
  const hudStars = Math.max(0, walk.stars - Math.floor((elapsed + 1) / 4));
  const goalScore = age >= 62 ? walk.coins?.scoreGain ?? 0 : 0;
  const score = Math.min(9999990, walk.scoreBefore + goalScore + total - balance(Math.max(0, elapsed - 1)));
  return { remaining: balance(elapsed), stars, hudStars, score };
}

export function drawCourseClear(
  scene: Phaser.Scene, ctx: CanvasRenderingContext2D, state: GameState, walk: Walk,
) {
  const { age } = goalWalkFrame(walk, state.tick);
  const view = goalCounters(walk, age, state.timeLeft);
  if (age >= 161) {
    const bonus = walk.stars !== 0 && age >= 202;
    drawClearPanel(scene, ctx, walk.finisher, state.timeLeft, view.remaining, bonus ? view.stars : undefined);
  }
  return view;
}

export function drawClearPanel(scene: Phaser.Scene, ctx: CanvasRenderingContext2D, player: PlayerId,
  time: number, remaining: number, stars?: number) {
  const h = stars === undefined ? 48 : 72;
  const art = scene.textures.get('hud/course-' + player).getSourceImage() as HTMLImageElement;
  const digits = scene.textures.get('hud/digits').getSourceImage() as HTMLImageElement;
  ctx.drawImage(art, 0, 0, 112, h, 72, 56, 112, h);
  hudNumber(ctx, digits, time, 80, 96, 3, 0);
  hudNumber(ctx, digits, remaining, 136, 96, 5, 0);
  if (stars !== undefined) hudNumber(ctx, digits, stars, 152, 112, 2, 16);
}
