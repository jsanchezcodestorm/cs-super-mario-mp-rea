import type Phaser from 'phaser';
import { palFrame, type GameState } from '@smw/core';
import type { ObjectPlanes } from './object-planes';

type GoalWalk = NonNullable<GameState['goalWalk']>;
interface StarLayout {
  digits: [number, number][][];
  rows: Record<string, number[]>;
}

/** The tape writes both figures directly into screen-space priority-3 OAM. */
export function drawGoalStars(scene: Phaser.Scene, objects: ObjectPlanes, walk: GoalWalk, tick: number) {
  const frame = palFrame(tick), age = frame - palFrame(walk.tick);
  if (!walk.stars || age < 1 || age >= 128) return;
  const layout: StarLayout = scene.cache.json.get('goal-star-layout');
  const image = scene.textures.get('goal-stars').getSourceImage() as HTMLImageElement;
  const sy = layout.rows[walk.roomId][(frame >> 2) & 7] * 8;
  const sx = age <= 112 ? 0 : age <= 116 ? 8 : age <= 120 ? 16 : 24;
  const digit = (value: number, x: number, first: number) => {
    for (const [i, [dx, dy]] of layout.digits[value].entries()) {
      objects.queue({ image, sx, sy, w: 8, h: 8, x: x + dx, y: 64 + dy, priority: 3, oam: first + i });
    }
  };
  if (walk.stars >= 10) digit(Math.floor(walk.stars / 10), 100, 8);
  digit(walk.stars % 10, 132, 21);
}
