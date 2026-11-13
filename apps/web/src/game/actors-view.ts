import { looseYoshiPose, palFrame, type EntityState } from '@smw/core';

import { lookingRight, npcPose } from './npc-pose.ts';

// Most original actors use OAM emitted by their own sprite routine. The shell
// and player fireball are simulation transformations, not level sprite entries.
export function frameForEntity(
  e: EntityState,
  tick: number,
  tileset: number,
  atlas: { has: (key: string) => boolean },
) {
  const frameClock = palFrame(tick);
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
  if (e.kind === 'levelNpc' && (!e.resident || (e.spriteId === 0xa8 && !e.resident.phase))) return null;
  const special = npcPose(e, frameClock);
  if (special) return { texture: 'creatures', frame: tileset + ':' + special };
  const color = e.yoshiColor && ['yoshi', 'yoshiEgg', 'babyYoshi'].includes(e.kind) ? ':' + e.yoshiColor : '';
  const stomped = e.kind === 'mechaShell' || (e.kind === 'rex' && e.hp === 1);
  const key = tileset + '-' + e.spriteId + color + (stomped ? ':stomped' : '');
  const direction = lookingRight(e) && atlas.has(key + ':right/0') ? ':right/' : '/';
  let frame = (e.koopa?.phase ?? frameClock) % 32;
  if (e.spriteId === 0x35) frame = looseYoshiPose(e, tick);
  if (e.kind === 'magikoopa') frame = (e.age % 160 >= 64 ? 16 : 0) + 8 * ((palFrame(e.age) >> 3) & 1);
  if (e.kind === 'jumper' && e.spriteId === 0x51) frame = e.vy < 0 ? 0 : 8;
  if (e.shellDefense || (e.shellKickTick !== undefined && frameClock - palFrame(e.shellKickTick) < 32)) frame = 0;
  return atlas.has(key + direction + frame) ? { texture: 'creatures', frame: key + direction + frame } : null;
}

// Directional tracks contain the complete native OAM for each direction.
// These single-direction parts alone are captured for later mirroring.
export function mirrorEntity(e: EntityState) {
  return ['yoshi', 'shell', 'fireball', 'yoshiFire'].includes(e.kind) && lookingRight(e);
}
