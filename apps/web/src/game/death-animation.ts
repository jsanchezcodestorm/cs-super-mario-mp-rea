import { palFrame, type PlayerState } from '@smw/core';

export function departing(p: PlayerState, tick: number) {
  return p.status !== 'alive' && p.death !== undefined && tick - p.death.tick < p.death.duration;
}

export function deathPosition(p: PlayerState, tick: number, offsets: number[]) {
  const { y, tick: start, duration } = p.death!;
  // In co-op the checkpoint can return the player before a full cartridge death
  // sequence has elapsed. Fit the visible arc to that existing respawn window.
  const sample = duration === 76
    ? Math.floor((tick - start) * offsets.findIndex(offset => offset > 224) / duration)
    : palFrame(tick) - palFrame(start);
  const index = Math.max(0, Math.min(sample, offsets.length - 1));
  const moving = index > 0 && offsets[index] !== 0;
  return { x: p.x, y: y + offsets[index], flip: moving ? !!((palFrame(start) + index) & 4) : p.facing === 1 };
}
