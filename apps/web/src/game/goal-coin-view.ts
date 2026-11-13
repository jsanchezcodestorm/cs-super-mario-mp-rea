import { palFrame, type GameState } from '@smw/core';
import type { ObjectPlanes } from './object-planes';
import type { Camera } from './terrain-view';
import { queueEffectTile, scoreRise } from './effect-tiles';

const frames = [5, 7, 9, 11, 13, 15, 17, 18];

export function drawGoalCoins(objects: ObjectPlanes, coins: HTMLImageElement, effects: HTMLImageElement,
  walk: NonNullable<GameState['goalWalk']>, tick: number, camera: Camera) {
  const bonus = walk.coins!, now = palFrame(tick), age = now - palFrame(walk.tick);
  const draw = (frame: number, x: number, y: number, w: number, priority: number, oam: number) =>
    objects.queue({ image: effects, sx: frame*24, sy: 0, w, h: 16, x, y, priority, oam });
  if (age < 56) {
    const steps = Math.max(0, age - 15);
    // $D0 speed rises by 2 each PAL tick until $20. The sprite stays at the
    // same screen X as Mario's walk scrolls the level behind it.
    const lift = Math.floor((-48 * steps + steps*(steps-1)) / 16);
    for (const [i, sprite] of bonus.sprites.entries()) {
      const y = Math.round(sprite.y - camera.y) + lift, oam = 64 + 4*i;
      if (age > 0 && age < 16) draw((16-age) >> 2, sprite.x, y, 16, 2, oam);
      else queueEffectTile(objects, coins, 14 + (age ? (now+i >> 2) & 3 : 0), sprite.x, y, 2, oam);
    }
  }
  if (age < 55 || age >= 103) return;
  for (const popup of bonus.popups) {
    const sprite = bonus.sprites[popup.sprite];
    const y = Math.round(sprite.y - camera.y) - 31; // fall ends at y-23, GivePoints offsets by -8
    const rise = Math.min(scoreRise(palFrame(walk.tick)+55, age-55), Math.max(0, y-3));
    draw(4 + frames.indexOf(popup.type), sprite.x + bonus.popupCamera! - camera.x - 8,
      y - rise, 24, 3, 44 + 2*popup.slot);
  }
}
