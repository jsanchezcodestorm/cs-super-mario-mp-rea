import { palFrame, type EntityState } from '@smw/core';

const puffFrames = [0, 0, 1, 2, 3, 2, 3] as const;

export function enemyDefeatPose(e: EntityState, tick: number) {
  if (!e.defeat) return undefined;
  const age = palFrame(tick) - palFrame(e.defeat.tick);
  if (e.defeat.kind === 'puff') {
    const frame = puffFrames[age >> 2];
    return frame === undefined ? undefined : { kind: 'puff' as const, frame };
  }
  return { kind: 'tumble' as const, flipY: true };
}
