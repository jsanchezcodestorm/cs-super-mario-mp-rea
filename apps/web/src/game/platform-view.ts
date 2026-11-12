import type { EntityState } from '@smw/core';

export type DrawActor = (
  key: string,
  frame: string,
  x: number,
  y: number,
  flip: boolean,
  alpha?: number,
  texture?: string,
) => void;

// Recompose articulated sprites from their individual OAM char numbers so the
// visible joints and platform endpoints follow the same model as collisions.
export function drawPlatform(e: EntityState, x: number, y: number, tileset: number, draw: DrawActor) {
  const part = (name: string, i: number, cx: number, bottom: number) =>
    draw(e.id + '/' + i, tileset + ':' + name, cx, bottom, false, 1, 'creatures');
  if (e.spriteId === 0x59 || e.spriteId === 0x5a) {
    for (let i = 0; i < 5; i++)
      part('block', i, x + 8 + ((e.width - 16) * i) / 4, y + 16 + ((e.height - 16) * i) / 4);
    return true;
  }
  if (e.spriteId === 0xa3) {
    const cx = e.origin.x + 8, cy = e.origin.y + 8;
    for (let i = 0; i < 3; i++) {
      part('link', i, cx + (x + 24 - cx) * i / 3, cy + (y + 8 - cy) * i / 3 + 4);
    }
    for (const [i, name] of ['deck-left', 'deck-center', 'deck-right'].entries())
      part(name, i + 3, x + 8 + 16 * i, y + 16);
    return true;
  }
  if (e.spriteId !== 0x5f) return false;
  const ox = e.origin.x + 40,
    oy = e.origin.y + 104;
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    part('link', i, ox + (x + 32 - ox) * t, oy + (y + 8 - oy) * t + 8);
  }
  for (const [i, name] of ['deck-left', 'deck-center', 'deck-center', 'deck-right'].entries())
    part(name, 5 + i, x + 8 + 16 * i, y + 16);
  return true;
}
