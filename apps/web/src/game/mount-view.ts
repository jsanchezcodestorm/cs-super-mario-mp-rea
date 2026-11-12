import { yoshiPowers, type PlayerState } from '@smw/core';
import type { DrawActor } from './platform-view';

export function drawMount(
  p: PlayerState,
  x: number,
  y: number,
  tileset: number,
  tick: number,
  draw: DrawActor,
) {
  if (!p.mounted) return;
  const bottom = y + p.height,
    center = x + p.width / 2,
    prefix = tileset + ':';
  const flip = p.facing === 1,
    beat = (tick >> 3) & 1, frame=p.tongue>0?2:p.mouth?3:beat;
  draw('mount-' + p.id, tileset + '-53:' + p.yoshiColor + '/' + frame, center+p.facing*3, bottom, flip, 1, 'creatures');
  if (yoshiPowers(p).wings)
    draw('wings-' + p.id, prefix + 'wing' + beat, center - p.facing * 6, bottom - 12, flip, 1, 'creatures');
  if (p.tongue <= 0) return;
  const start = flip ? x + p.width : x,
    end = start + p.facing * (p.tongue - 4);
  for (let i = 0; i <= 4; i++)
    draw(
      'tongue-' + p.id + '-' + i,
      prefix + (i === 4 ? 'tongue-tip' : 'tongue-body'),
      start + ((end - start) * i) / 4,
      bottom - 7,
      flip,
      1,
      'creatures',
    );
}
