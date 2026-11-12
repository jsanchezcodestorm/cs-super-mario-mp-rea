import type { EntityState, PlayerState } from '@smw/core';

export function frameForPlayer(p: PlayerState, tick: number, water: boolean) {
  let pose = 0;
  if (p.status === 'dead') pose = 62;
  else if (p.mounted) pose = p.tongue > 0 ? 39 : 32;
  else if (p.balloon > 0) pose = p.form === 'small' ? 66 : 67;
  else if (p.flight && p.form === 'cape') pose = p.vy < 0 ? 42 : 45;
  else if (p.spin) pose = (p.form === 'small' ? [0, 37, 0, 15] : [0, 68, 0, 69])[(tick >> 2) & 3];
  else if (water && !p.grounded) pose = [22, 26, 26, 24][(tick >> 3) & 3] + Number(!!p.carrying);
  else if (p.carrying) pose = p.grounded ? 7 + (Math.floor(tick / 8) % 2) : 9;
  else if (!p.grounded) pose = p.vy < 0 ? 11 : 12;
  else if (Math.abs(p.vx) > 0.1) pose = (Math.floor(tick / 6) % 2) + (p.runTicks > 20 ? 4 : 0);
  return p.id + '/' + p.form + '/' + pose;
}

// Most original actors use OAM emitted by their own sprite routine. The shell
// and player fireball are simulation transformations, not level sprite entries.
export function frameForEntity(
  e: EntityState,
  tick: number,
  tileset: number,
  atlas: { has: (key: string) => boolean },
) {
  const f = Math.floor(tick / 9) % 2;
  if (e.kind === 'exitSide') return null;
  if (e.kind === 'shell') {
    const colors = ['green', 'red', 'blue', 'yellow'];
    const id = e.shellColor ? 4 + colors.indexOf(e.shellColor) : e.spriteId;
    return { texture: 'creatures', frame: tileset + ':shell' + id + '/' + f };
  }
  if (e.kind === 'chuckShot' && e.projectile === 'baseball')
    return { texture: 'creatures', frame: tileset + ':baseball' + ((tick >> 2) & 3) };
  if (e.kind === 'yoshiFire') return { texture: 'creatures', frame: tileset + ':spit' + ((tick >> 3) & 1) };
  if (e.kind === 'fireball')
    return { texture: 'creatures', frame: tileset + ':fireball' + ((tick >> 2) & 3) };
  const color = e.yoshiColor && ['yoshi', 'yoshiEgg', 'babyYoshi'].includes(e.kind) ? ':' + e.yoshiColor : '';
  const key = tileset + '-' + e.spriteId + color + '/';
  if (atlas.has(key + f)) return { texture: 'creatures', frame: key + f };
  if (atlas.has(key + (1 - f))) return { texture: 'creatures', frame: key + (1 - f) };
  return null;
}
