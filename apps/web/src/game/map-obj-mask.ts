import type { RevealFrame } from './map-reveal';

export interface Occlusion {
  masks: number[][];
  tracks: number[][];
  regions: { cols: number; base: number[]; events: Record<number, [cell: number, patch: number, track: number][]> }[];
}

/** OBJ0/1 are behind every nontransparent BG1 pixel on the main screen. BG2 is on the subscreen. */
export function mapObjectMask(data: Occlusion, regionId: number, frame: number,
  completed: string[], events: Record<string, number>, reveal?: RevealFrame) {
  const region = data.regions[regionId];
  const changed = new Map<number, number>();
  for (const exit of completed) {
    const active = reveal?.exit === exit && reveal.clip.region === regionId ? reveal : undefined;
    for (const [cell, patch, track] of region.events[events[exit]] ?? []) {
      if (!active || active.age >= active.clip.cells[patch]) changed.set(cell,track);
    }
  }
  return (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= 8 * region.cols || y >= 8 * region.base.length / region.cols) return false;
    const cell = (y >> 3) * region.cols + (x >> 3);
    const phases = data.tracks[changed.get(cell) ?? region.base[cell]];
    return !!(data.masks[phases[frame % phases.length]][y & 7] & (128 >> (x & 7)));
  };
}

export function clipMapObject(ctx: CanvasRenderingContext2D, blocked: (x: number, y: number) => boolean,
  x: number, y: number, offsetX: number, offsetY: number) {
  ctx.beginPath();
  for (let row = 0; row < 16; row++) {
    let col = 0;
    while (col < 16) {
      while (col < 16 && blocked(x + col, y + row)) col++;
      const start = col;
      while (col < 16 && !blocked(x + col, y + row)) col++;
      if (col > start) ctx.rect(x + start + offsetX, y + row + offsetY, col - start, 1);
    }
  }
  ctx.clip();
}
