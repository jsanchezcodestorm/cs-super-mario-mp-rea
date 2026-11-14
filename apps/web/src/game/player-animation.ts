import { Buttons, nativeSpeed, palFrame, playerPipePosition, type PlayerState, type PowerForm } from '@smw/core';
import { netPlayerPose } from './net-player';

function spinning(p: PlayerState, tick: number) {
  return (p.spin && !p.animation?.swimming) ||
    (p.form === 'cape' && (p.animation?.spinUntil ?? 0) > palFrame(tick));
}

export function playerFacingRight(p: PlayerState, tick: number) {
  if (p.pipeExit && playerPipePosition(p, tick)) return p.pipeExit.direction !== 'left';
  if (p.status === 'alive' && !p.mounted && !p.pipeExit && !p.balloon) {
    const net = netPlayerPose(p, tick);
    if (net) return net.right;
    if (p.animation?.climbing) return p.animation.climbRight;
    if (spinning(p, tick)) return !!(palFrame(tick) & 4);
  }
  return p.facing === 1;
}

function walkingPose(p: PlayerState, form: PowerForm) {
  const step = (p.animation?.step ?? 0) % (form === 'small' ? 2 : 3);
  const speed = nativeSpeed(p.vx);
  if (!speed || p.cloud) {
    const looking = p.lastInput & Buttons.up ? 3 : 0;
    return looking + (p.carrying ? 7 : 0);
  }
  const brakes = p.vx > 0 ? Buttons.left : Buttons.right;
  if (p.grounded && p.lastInput & brakes) return 13;
  return step + (p.carrying ? 7 : speed >= 0x3a ? 4 : 0);
}

function bodyPose(p: PlayerState, tick: number, form: PowerForm) {
  const a = p.animation;
  const shot = form === 'fire' && (a?.shotUntil ?? 0) > palFrame(tick);
  if (p.status === 'dead') return 62;
  if (p.pipeExit && playerPipePosition(p, tick)) {
    const vertical = p.pipeExit.direction === 'up' || p.pipeExit.direction === 'down';
    if (vertical) return p.mounted ? 33 : 15;
    if (p.mounted) return 41;
    const elapsed = palFrame(tick) - palFrame(p.pipeExit.tick);
    const length = form === 'small' ? 2 : 3;
    return (length - (Math.ceil(elapsed / 4) % length)) % length + (p.carrying ? 7 : 0);
  }
  if (p.mounted) {
    if (p.tongueFrame > 0 && p.tongueFrame < 18) return p.tongueFrame < 7 ? 39 : 40;
    return p.ducking && !p.tongueFrame ? 29 : 32;
  }
  if (p.balloon > 0) return form === 'small' ? 66 : 67;
  if (p.wallRun) return 17 + ((a?.step ?? 0) % (form === 'small' ? 2 : 3));
  const net = netPlayerPose(p, tick);
  if (net) return net.pose;
  if (a?.climbing) return 21;
  if (a?.swimming && !p.grounded && !(form === 'cape' && spinning(p, tick))) {
    return (shot ? 24 : [22, 26, 26, 24][(a.stroke >> 2) & 3]) + Number(!!p.carrying);
  }
  if (spinning(p, tick)) return (form === 'small' ? [0, 37, 0, 15] : [0, 68, 0, 69])[(palFrame(tick) >> 1) & 3];
  if (p.sliding) return 28;
  if (p.ducking) return p.carrying ? 29 : 60;
  if (shot) return p.grounded ? 63 : 22;
  if (a?.kick) return 14;
  if (a?.pickup && p.carrying) return 29;
  if (!p.grounded && !p.cloud) {
    if (p.carrying) return 9;
    if (p.flight && form === 'cape' && a?.glide) return 41 + a.glide;
    if (a?.takeoff) return walkingPose(p, form);
    if (p.runTicks === 64) return 12;
    return p.vy < 0 ? 11 : 36;
  }
  return walkingPose(p, form);
}

export function frameForPlayer(p: PlayerState, tick: number) {
  const form = p.growthPending ? 'small' : p.form;
  const pose = bodyPose(p, tick, form);
  let cape = 0;
  if (form === 'cape' && p.status === 'alive' && !p.netClinging && !p.animation?.climbing && pose !== 15 && pose !== 33) {
    const spinCape = spinning(p, tick) && !p.mounted && !p.pipeExit && !p.animation?.climbing && !p.balloon;
    cape = spinCape
      ? ([2, 7, 6, 9][(palFrame(tick) & 2) + Number(!p.grounded && p.vy >= 0)])
      : p.animation?.cape ?? 0;
    if ((p.pipeExit?.direction === 'left' || p.pipeExit?.direction === 'right') && playerPipePosition(p, tick)) {
      const phase = (palFrame(tick) - palFrame(p.pipeExit.tick)) >> 2;
      cape = phase ? [5, 6, 3, 4][(phase - 1) & 3] : 0;
    }
  }
  return p.character + '/' + form + '/' + (pose + 128 * cape);
}
