import { netKoopaPose, palFrame, type EntityState } from '@smw/core';

export function lookingRight(e: EntityState) {
  if (e.shellDefense) return e.shellDefense.facing === 1;
  if (e.kind === 'shell' && e.vx) return e.vx > 0;
  return e.facing !== undefined ? e.facing === 1 : e.vx > 0;
}

function chuckPose(e: EntityState, frame: number) {
  if (e.stunnedUntil !== undefined && e.age < e.stunnedUntil) {
    const index = Math.floor((18 - (e.stunnedUntil - e.age)) / 3);
    return [10,11,10,12,13,12][Math.max(0, Math.min(5, index))];
  }
  const type = e.hp < 3 ? 0x91 : e.spriteId;
  if (type === 0x97) {
    const elapsed = (e.age + 127) % 128;
    return elapsed >= 8 && elapsed < 24 ? 17 : 0;
  }
  if (type === 0x98) {
    if (e.age % 128 < 64) return 0;
    const until = (6 - e.age % 32 + 32) % 32;
    return [24,25,20,20][((until + 6) >> 3) & 3];
  }
  if (type === 0x94) return frame & 0x30 ? 6 : 3;
  if (type === 0x95) return e.grounded ? 4 : e.vy < -1 ? 6 : 7;
  if (type === 0x91 || type === 0x92 || type === 0x93)
    return !e.grounded && e.vy < 0 ? 6 : e.vx ? 18 + ((frame >> 2) & 1) : 3;
  return undefined;
}

export function npcPose(e: EntityState, frame: number): string | undefined {
  const right = Number(lookingRight(e));
  if (e.kind === 'lakitu') {
    const fishing = (e.origin.x & 16) && !e.baitTaken;
    const throwing = e.lastThrowFrame !== undefined && frame - e.lastThrowFrame < 32;
    return 'lakitu/' + (2 * (fishing ? 2 : Number(throwing)) + right);
  }
  if (e.kind === 'netKoopa') return 'net' + e.spriteId + '/' + netKoopaPose(e);
  if (e.spriteId === 0x15 && e.fromEnemyBlock) return 'flop21/' + (2 * ((frame >> 3) & 1) + right);
  if (e.spriteId === 0xb3 && e.kind === 'bullet') return 'resident179/' + (2 * ((frame >> 1) & 3) + right);
  if (e.spriteId === 0xb0 && e.booStream) return 'resident176/' + (4 * (e.booStream.slot & 3) + 2 * ((frame >> 4) & 1) + right);
  if (e.boo) {
    const track = e.spriteId === 0xaf ? 'resident' : 'boo';
    return track + e.spriteId + '/' + (2 * e.boo.pose + right);
  }
  if (e.kind === 'levelNpc' && e.resident) {
    const s = e.resident;
    let pose = s.pose;
    if (e.spriteId === 0xbc && s.variant === 2) pose++;
    if (e.spriteId === 0x8a) pose += 3 * s.variant;
    if (e.spriteId !== 0x90 && e.spriteId !== 0x9d) pose = 2 * pose + right;
    return 'resident' + e.spriteId + '/' + pose;
  }
  if (e.spriteId === 0x9d && e.emission) {
    // The co-op generator releases its payload at age 240.
    const remaining = palFrame(240) - palFrame(e.age);
    const phase = remaining < 2 ? 6 : remaining < 4 ? 5 : remaining < 6 ? 4 : (frame >> 3) & 3;
    return 'resident157/' + ((e.emission.c2 & 3) * 7 + phase);
  }
  if (e.spriteId === 0x1c && e.kind === 'bullet') return 'bill/' + (e.emission?.c2 ?? (right ? 0 : 1));
  if (e.spriteId === 2 && !e.shellDefense && e.shellKickTick !== undefined && frame - palFrame(e.shellKickTick) < 25)
    return 'kick2/' + right;
  if (e.kind === 'chuck') {
    if (e.spriteId === 0x46 && e.hp === 3 && !(e.stunnedUntil && e.age < e.stunnedUntil)) {
      // Release the rock on the first shovel swing in the co-op attack cycle.
      const sinceThrow = (e.age + 48) % 96;
      const stage = sinceThrow < 22 ? 1 : sinceThrow < 29 ? 2 : sinceThrow < 62 ? 3 : 0;
      return 'digChuck/' + (2 * stage + right);
    }
    const pose = chuckPose(e, frame);
    if (pose !== undefined) return 'chuck/' + (pose * 2 + right);
  }
  if (e.koopa?.turn && e.spriteId <= 12 && e.kind !== 'shell') {
    const turningRight = e.koopa.turn >= 5 ? 1 - right : right;
    return 'turn' + e.spriteId + '/' + (2 * ((frame >> 2) & 1) + turningRight);
  }
  if (e.koopa && e.grounded && e.spriteId >= 8 && e.spriteId <= 12)
    return 'wingGround' + e.spriteId + '/' + (2 * ((e.koopa.phase >> 3) & 1) + right);
}
