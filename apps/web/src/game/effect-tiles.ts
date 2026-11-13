import { palFrame, type BlockBounce } from '@smw/core';
import type { ObjectPlanes } from './object-planes';
import type { Camera } from './terrain-view';

export function queueEffectTile(objects: ObjectPlanes, image: HTMLImageElement, frame: number,
  x: number, y: number, priority: number, oam: number) {
  objects.queue({ image, sx: frame * 16, sy: 0, w: 16, h: 16, x: Math.round(x), y: Math.round(y), priority, oam });
}

const questionLift = [0, -4, -7, -9, -10, -10, -9, -7];
const turnLift = [-4, -7, -9, -9, -9, -7];

export function drawBlockBounces(objects: ObjectPlanes, image: HTMLImageElement, bouncing: BlockBounce[],
  tick: number, room: string, camera: Camera) {
  const active = bouncing.filter(b => b.roomId === room).slice(-4);
  for (const [index, b] of active.entries()) {
    const age = palFrame(tick) - palFrame(b.tick);
    const lift = (b.tile === 0x11e ? turnLift : questionLift)[age];
    if (lift === undefined) continue;
    const frame = b.tile === 0x11b || b.tile === 0x11e ? 26 : 25;
    queueEffectTile(objects, image, frame, b.col * 16 - camera.x, b.row * 16 + lift - camera.y, 2, 7 - index);
  }
}

export function scoreRise(first: number, age: number) {
  let rise = 0;
  for (let i = 0; i <= age; i++) {
    const mask = [3, 1, 0][(47 - i) >> 4];
    if (!((first + i) & mask)) rise++;
  }
  return rise;
}
