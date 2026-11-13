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
  const endX = x + 32,
    endY = y + 8;
  // Native OAM order is the platform-end link, pivot link, then four links
  // at fifths of the chain length.
  part('brown-platform/0', 0, endX, endY + 8);
  part('brown-platform/0', 1, ox, oy + 8);
  for (let link = 1; link <= 4; link++) {
    const t = link / 5;
    part('brown-platform/0', link + 1, ox + (endX - ox) * t, oy + (endY - oy) * t + 8);
  }
  for (let tile = 0; tile < 4; tile++)
    part('brown-platform/' + (tile + 5), tile + 6, x + 56 - 16 * tile, y + 16);
  return true;
}
