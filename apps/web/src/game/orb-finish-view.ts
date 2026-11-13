import type Phaser from 'phaser';
import { orbFinishFrame, type GameState } from '@smw/core';
import { drawClearPanel, goalCounters } from './course-clear';
import type { StatusBar } from './status-bar';

export function drawOrbFinish(scene: Phaser.Scene, ctx: CanvasRenderingContext2D,
  state: GameState, statusBar: StatusBar) {
  const orb = state.orbFinish!;
  const { age, brightness } = orbFinishFrame(orb, state.tick);
  // The sphere starts the same BG3 tally 159 PAL frames earlier than the tape.
  const tally = goalCounters({ scoreBefore: orb.scoreBefore, stars: 0 }, age + 159, state.timeLeft);
  if (age >= 2) drawClearPanel(scene, ctx, orb.finisher, state.timeLeft, tally.remaining);
  statusBar.paint(ctx, { ...state.players[orb.finisher], score: tally.score }, state);
  if (brightness < 15) {
    ctx.fillStyle = `rgba(0,0,0,${1 - brightness / 15})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}
