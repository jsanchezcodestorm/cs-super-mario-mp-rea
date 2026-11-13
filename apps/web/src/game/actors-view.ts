import type { EntityState } from '@smw/core';

// Most original actors use OAM emitted by their own sprite routine. The shell
// and player fireball are simulation transformations, not level sprite entries.
export function frameForEntity(
  e: EntityState,
  tick: number,
  tileset: number,
  atlas: { has: (key: string) => boolean },
) {
  const frameClock = Math.floor((tick * 5) / 6);
  if (e.pipePlant) return { texture: 'creatures', frame: tileset + ':pipe-plant' + e.spriteId + '/' + e.pipePlant.pose };
  if (e.kind === 'exitSide') return null;
  if (e.kind === 'cloudCoin') return { texture: 'creatures', frame: tileset + ':cloud-coin' };
  if (e.kind === 'shell') {
    const colors = ['green', 'red', 'blue', 'yellow'];
    const id = e.shellColor ? 4 + colors.indexOf(e.shellColor) : e.spriteId;
    const spinning = !!e.vx && !e.tossed && !e.shellKnockedOut;
    return { texture: 'creatures', frame: tileset + ':shell' + id + '/' + (spinning ? (frameClock >> 2) & 3 : 0) };
  }
  if (e.kind === 'chuckShot' && e.projectile === 'baseball')
    return { texture: 'creatures', frame: tileset + ':baseball' + ((frameClock >> 2) & 3) };
  if (e.kind === 'yoshiFire') return { texture: 'creatures', frame: tileset + ':spit' + ((frameClock >> 3) & 1) };
  if (e.kind === 'fireball')
    return { texture: 'creatures', frame: tileset + ':fireball' + ((frameClock >> 2) & 3) };
  const color = e.yoshiColor && ['yoshi', 'yoshiEgg', 'babyYoshi'].includes(e.kind) ? ':' + e.yoshiColor : '';
  const stomped = e.kind === 'mechaShell' || (e.kind === 'rex' && e.hp === 1);
  const key = tileset + '-' + e.spriteId + color + (stomped ? ':stomped' : '') + '/';
  const frame = e.spriteId === 0x35 ? (frameClock % 32 <= 12 ? 0 : 1) : frameClock % 32;
  return atlas.has(key + frame) ? { texture: 'creatures', frame: key + frame } : null;
}
