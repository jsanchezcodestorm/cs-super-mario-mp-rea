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
    // $02:D848 emits the deck right to left followed by a link at the
    // deck centre, then the links at two thirds and one third of its radius.
    for (let slot = 0; slot < 3; slot++) {
      part('gray-platform/' + slot, slot, x + 40 - 16 * slot, y + 16);
      const ratio = (3 - slot) / 3;
      part('gray-platform/' + (slot + 3), slot + 3,
        cx + (x + 24 - cx) * ratio, cy + (y + 8 - cy) * ratio + 8);
    }
    return true;
  }
  if (e.spriteId !== 0x5f) return false;
  const ox = e.origin.x + 40,
    oy = e.origin.y + 104;
  for (let i = 0; i < 5; i++) {
    const t = i / 5;
    part('brown-platform/' + i, i, ox + (x + 32 - ox) * t, oy + (y + 8 - oy) * t + 8);
  }
  for (let slot = 5; slot < 9; slot++)
    part('brown-platform/' + slot, slot, x + 56 - 16 * (slot - 5), y + 16);
  return true;
}
