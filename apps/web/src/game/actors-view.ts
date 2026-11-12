import type { EntityState, PlayerState } from '@smw/core';

export function frameForPlayer(p: PlayerState, tick: number, water: boolean) {
  const frame = Math.floor((tick * 5) / 6),
    form = p.growthPending ? 'small' : p.form;
  let pose = 0;
  if (p.status === 'dead') pose = 62;
  else if (p.sliding) pose = 28;
  else if (p.mounted) pose = p.tongue > 0 ? 39 : 32;
  else if (p.balloon > 0) pose = form === 'small' ? 66 : 67;
  else if (p.flight && form === 'cape') pose = p.vy < 0 ? 42 : 45;
  else if (p.spin) pose = (form === 'small' ? [0, 37, 0, 15] : [0, 68, 0, 69])[(frame >> 2) & 3];
  else if (water && !p.grounded) pose = [22, 26, 26, 24][(frame >> 3) & 3] + Number(!!p.carrying);
  else if (p.carrying) pose = p.grounded ? 7 + (Math.floor(frame / 8) % 2) : 9;
  else if (!p.grounded) pose = p.vy < 0 ? 11 : 12;
  else if (Math.abs(p.vx) > 0.1) pose = (Math.floor(frame / 6) % 2) + (p.runTicks > 20 ? 4 : 0);
  return p.id + '/' + form + '/' + pose;
}

// Most original actors use OAM emitted by their own sprite routine. The shell
// and player fireball are simulation transformations, not level sprite entries.
export function frameForEntity(
  e: EntityState,
  tick: number,
  tileset: number,
  atlas: { has: (key: string) => boolean },
) {
  const frameClock = Math.floor((tick * 5) / 6),
    twoFrame = Math.floor(frameClock / 16) % 2;
  if (e.kind === 'exitSide') return null;
  if (e.kind === 'shell') {
    const colors = ['green', 'red', 'blue', 'yellow'];
    const id = e.shellColor ? 4 + colors.indexOf(e.shellColor) : e.spriteId;
    return { texture: 'creatures', frame: tileset + ':shell' + id + '/' + twoFrame };
  }
  if (e.kind === 'chuckShot' && e.projectile === 'baseball')
    return { texture: 'creatures', frame: tileset + ':baseball' + ((frameClock >> 2) & 3) };
  if (e.kind === 'yoshiFire') return { texture: 'creatures', frame: tileset + ':spit' + ((frameClock >> 3) & 1) };
  if (e.kind === 'fireball')
    return { texture: 'creatures', frame: tileset + ':fireball' + ((frameClock >> 2) & 3) };
  const color = e.yoshiColor && ['yoshi', 'yoshiEgg', 'babyYoshi'].includes(e.kind) ? ':' + e.yoshiColor : '';
  const key = tileset + '-' + e.spriteId + color + '/';
  const frame = e.spriteId === 0x35 ? (frameClock % 32 <= 12 ? 0 : 1) : frameClock % 32;
  return atlas.has(key + frame) ? { texture: 'creatures', frame: key + frame } : null;
}
