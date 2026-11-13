import type { Stage } from './content';
import { effectiveTile, palFrame, type GameState } from '@smw/core';

// A turn block remains physically open while its Map16 tile spins. During
// the first six PAL frames its bounce sprite supplies the visible pixels.
export function spinningBlocks(stage: Pick<Stage, 'id' | 'width'>, state: GameState) {
  const cells = new Set<number>();
  for (const block of state.turning ?? []) {
    if (block.roomId === stage.id) cells.add(block.row * stage.width + block.col);
  }
  for (const block of state.bouncingBlocks ?? []) {
    if (block.roomId === stage.id && block.tile === 0x11e) cells.delete(block.row * stage.width + block.col);
  }
  return cells;
}

export function drawTilePlane(
  ctx: CanvasRenderingContext2D, stage: Stage, atlas: CanvasImageSource, masks: number[], high: boolean,
  sx: number, sy: number, state: GameState, foreground: boolean,
) {
  const phase = palFrame(state.tick) & 31;
  const spinning = foreground && spinningBlocks(stage, state);
  const grid = foreground ? stage : stage.background!;
  const repeat = !foreground && stage.background!.repeat;
  const { width, height, tiles } = grid;
  for (let row = sy >> 4; row <= (sy + 223) >> 4; row++)
    for (let col = sx >> 4; col <= (sx + 255) >> 4; col++) {
      if (!repeat && (row < 0 || col < 0 || row >= height || col >= width)) continue;
      const idx = (((row % height) + height) % height) * width + ((col % width) + width) % width;
      const tile = spinning && spinning.has(idx) ? 0x48 : foreground ? effectiveTile(state, stage, idx) : tiles[idx];
      const mask = high ? masks[tile] : 15 ^ masks[tile];
      if (!mask) continue;
      const animations = stage.animatedTiles;
      const track = (state.onOff && animations?.[tile + 1024]) || animations?.[tile];
      const id = track ? track[(phase * track.length) >> 5] : tile;
      const ax = (id % 32) * 16, ay = (id >> 5) * 16, x = col * 16 - sx, y = row * 16 - sy;
      if (mask === 15) ctx.drawImage(atlas, ax, ay, 16, 16, x, y, 16, 16);
      else for (let q = 0; q < 4; q++) {
        if (!(mask & (1 << q))) continue;
        const dx = (q >> 1) * 8, dy = (q & 1) * 8;
        ctx.drawImage(atlas, ax + dx, ay + dy, 8, 8, x + dx, y + dy, 8, 8);
      }
    }
}
