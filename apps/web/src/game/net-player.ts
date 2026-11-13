import { palFrame, type PlayerState } from '@smw/core';

// Horizontal direction and body tables read by the E1 climbing handler.
// Its last two body entries are the adjacent front/back climbing poses.
const turnPose = [34, 21, 34, 21, 33, 31, 32, 32, 32, 32, 31, 33, 31, 33, 21, 34];
const turnFacing = [0, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

export function drawnBehindNet(p: PlayerState, tick: number) {
  const turn = p.netTurn;
  // OAM is emitted before the gate sprite toggles $13F9 on its sixteenth frame.
  if (turn && palFrame(tick) - palFrame(turn.tick) === 15) return turn.fromBehind;
  return !!p.behindNet;
}

export function netPlayerPose(p: PlayerState, tick: number) {
  if (!p.netClinging) return;
  const turn = p.netTurn;
  if (turn) {
    const timer = 31 - (palFrame(tick) - palFrame(turn.tick));
    const index = ((timer >> 1) & 14) | Number(turn.fromBehind);
    return { pose: turnPose[index], right: !!(turnFacing[index] ^ Number(turn.offsetX >= 0)) };
  }
  const elapsed = p.netPunchTick === undefined ? Infinity : palFrame(tick) - palFrame(p.netPunchTick);
  if (elapsed >= 1 && elapsed < 8) {
    // $94 is the sprite origin, two pixels before the web collision box.
    return { pose: p.behindNet ? 35 : 30, right: !(Math.floor(p.x + p.width / 2 - 8) & 8) };
  }
  return { pose: p.behindNet ? 34 : 21, right: p.animation?.climbRight ?? p.facing === 1 };
}
