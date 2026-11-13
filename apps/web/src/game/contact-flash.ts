import { palFrame, type RewardEffect } from '@smw/core';
import { queueEffectTile } from './effect-tiles';
import type { ObjectPlanes } from './object-planes';
import type { Camera } from './terrain-view';

export function drawContactFlash(objects: ObjectPlanes, sheet: HTMLImageElement, effects: readonly RewardEffect[],
  now: number, room: string, camera: Camera) {
  let visible: RewardEffect | undefined;
  let frame = 0;
  // Smoke sprites run from slot 3 to 0 and all write the same four OAM entries.
  for (const e of effects) {
    if (e.roomId !== room || e.impactSlot === undefined || (visible && e.impactSlot >= visible.impactSlot!)) continue;
    const age = now - palFrame(e.tick);
    const x = Math.floor(e.x) - camera.x;
    if (age < 1 || age > 8 || x < 0 || x >= 240) continue;
    visible = e;
    frame = 32 + (((8 - age) >> 1) & 1);
  }
  if (visible) queueEffectTile(objects, sheet, frame, Math.floor(visible.x) - camera.x, Math.floor(visible.y) + 8 - camera.y, 2, 60);
}
