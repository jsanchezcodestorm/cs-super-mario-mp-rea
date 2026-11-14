import { goalWalkFrame, palFrame, type GameState, type PlayerState } from '@smw/core';
import { frameForPlayer } from './player-animation';

// GrowingAniImgs, E1 $00:D0BD. The engine keeps Powerup at zero
// while it draws the intermediate and full-height transition poses.
const growth = [0, 61, 0, 61, 0, 61, 70, 61, 70, 61, 70, 61];

export function playerAppearance(p: PlayerState, tick: number, walk?: GameState['goalWalk']) {
  if (walk && p.status === 'alive' && p.roomId === walk.roomId && goalWalkFrame(walk, tick).salute) {
    const form = p.growthPending ? 'small' : p.form;
    return { frame: p.character + '/' + form + '/' + (p.mounted ? 20 : 38), visible: true };
  }
  const clock = palFrame(tick), change = p.formChange;
  const age = change ? clock - palFrame(change.tick) : Infinity;
  const body = frameForPlayer(p, tick);
  if (change && !p.growthPending && p.status === 'alive' && age >= 0) {
    if ((change.to === 'super' || change.to === 'small') && age <= 48) {
      const index = Math.min(11, Math.max(0, age - 1) >> 2);
      const pose = growth[change.to === 'small' ? 11 - index : index];
      return { frame: p.character + '/small/' + pose, visible: true };
    }
    if (change.to === 'cape' && age < 27) {
      // $0296D8 smoke timer starts at $1B, the body is masked for $18 frames.
      const tiles = [0, 0, 1, 2, 3, 2, 3];
      return { frame: body, visible: age === 0 || age > 24, smoke: tiles[(26 - age) >> 2] };
    }
  }
  const flower = change?.to === 'fire' && age < 32;
  let frame = body;
  if (flower || p.star > 0) {
    // CyclePaletteTimer uses the slow clock. The star slows for its last $18 units.
    const palette = (flower || palFrame(p.star) <= 0x18 * 4 ? clock >> 2 : clock) & 3;
    frame = frame.replace(/\/(\w+)\//, '/$1-flash' + palette + '/');
  }
  const timer = Math.min(127, palFrame(p.invincible));
  const visible = p.status !== 'alive' || !timer || !!(timer & (1 << (timer >> 5)));
  return { frame, visible };
}
