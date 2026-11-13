import { palFrame } from './pal-time.ts'
import type { EntityState, PlayerState } from './types.ts'

const shotInterval = 190

/** The co-op attack event and its firing pose share the same simulation clock. */
export function bossFires(e: EntityState) { return e.age % shotInterval === 0 }

export function reznorPose(e: EntityState) {
  const sinceShot = e.age % shotInterval
  const untilShot = shotInterval - sinceShot
  if ((e.age >= shotInterval && palFrame(sinceShot) < 32) || palFrame(untilShot) <= 32) return 'spit'
  if (e.bossTurnTick !== undefined && palFrame(e.age) - e.bossTurnTick < 10) return 'turn'
  return 'idle'
}

export function updateBossFacing(e: EntityState, target: PlayerState) {
  const frame = palFrame(e.age)
  if (e.facing !== undefined && frame === palFrame(e.age - 1)) return
  const direction = target.x + target.width / 2 < e.x + e.width / 2 ? -1 : 1
  if (e.spriteId === 0xa9) {
    // DrawReznor checks every 64 PAL frames, staggered over four sprite slots.
    const slot = 7 - (e.origin.x / 16 - 1)
    if (e.facing !== undefined && (((frame + slot * 16) & 63) || reznorPose(e) !== 'idle')) return
    if (e.facing !== undefined && direction !== e.facing) e.bossTurnTick = frame
  } else {
    const platformKid = e.spriteId === 0x29 && (e.origin.y === 48 || e.origin.y === 64)
    if (e.facing !== undefined && (e.kind === 'endingBoss' || platformKid) && (frame & 31)) return
  }
  e.facing = direction
}
