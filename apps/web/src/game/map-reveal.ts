import type Phaser from 'phaser';
import { palFrame, type GameState } from '@smw/core';

interface Clip {
  duration: number;
  region: number;
  cells: number[];
  settled: [frame: number, x: number, y: number, group: number][];
  fx: [frame: number, x: number, y: number, group: number][];
}
export interface RevealData {
  clips: Record<string, Clip>;
  groups: [dx: number, dy: number, tile: number][][];
}
export interface RevealFrame {
  exit: string;
  clip: Clip;
  age: number;
}

export function preloadMapReveals(scene: Phaser.Scene) {
  scene.load.json('map-reveals', '/assets/world/reveal.json');
  scene.load.image('map-reveal-tiles', '/assets/world/reveal.png');
}

export function mapPresentation(state: GameState, data: RevealData) {
  const event = state.mapReveal;
  const clip = event && data.clips[event.exit];
  if (event && clip && state.phase === 'map') {
    const elapsed = state.tick - (event.start ?? state.tick);
    const age = palFrame(elapsed);
    if (age < clip.duration) {
      return { id: event.course, reveal: { exit: event.exit, clip, age }, travel: undefined, arrival: undefined };
    }
    const walk = event.travel;
    const walkingTicks = elapsed - Math.ceil(clip.duration * 6 / 5);
    if (walk && walkingTicks < walk.duration)
      return { id: walk.to, travel: { ...walk, elapsed: walkingTicks }, reveal: undefined, arrival: undefined };
    if (walk) return { id: walk.to, travel: undefined, reveal: undefined,
      arrival: { from: walk.from, command: walk.command, departed: state.tick - walkingTicks } };
  }
  return {
    id: state.mapTravel?.to ?? state.mapStop ?? state.progress.unlocked[state.progress.selection],
    travel: state.mapTravel,
    reveal: undefined,
    arrival: state.mapArrival,
  };
}

export function drawReveal(
  scene: Phaser.Scene, ctx: CanvasRenderingContext2D, data: RevealData,
  reveal: RevealFrame, offsetX: number, offsetY: number,
) {
  const image = scene.textures.get('map-reveal-tiles').getSourceImage() as HTMLImageElement;
  function draw([, x, y, group]: Clip['fx'][number]) {
    if (group < 0) return;
    for (const [dx, dy, index] of data.groups[group])
      ctx.drawImage(image, (index % 32)*8, (index >> 5)*8, 8, 8, x+dx+offsetX, y+dy+offsetY, 8, 8);
  }
  for (const step of reveal.clip.settled) {
    if (step[0] > reveal.age) break;
    draw(step);
  }
  const phases = reveal.clip.fx;
  for (let i = phases.length-1; i >= 0; i--) {
    if (phases[i][0] <= reveal.age) {
      draw(phases[i]);
      break;
    }
  }
}
