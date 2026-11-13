import { palFrame } from './pal-time.ts'
import { moveBody } from './terrain.ts'
import type { EntityState, LevelDefinition, World } from './types.ts'

const growthFrames = [29, 28, 29, 28, 27, 28, 27, 28]
const runSpeed = 24 / 16 * 5 / 6

export function looseYoshiPose(e: EntityState, tick: number) {
  const clock = palFrame(tick)
  if (e.yoshiGrowthTick !== undefined) {
    const start = palFrame(e.yoshiGrowthTick)
    const age = clock - start
    if (age <= 64) {
      const pose = age === 0 ? 29 : growthFrames[(64 - age) >> 3]
      // E1 freezes EffFrame during growth. Only native body pose 12 has a visible head.
      return pose === 29 && !((start - 1) & 0x30) ? 30 : pose
    }
  }
  // OAM uses the effective frame before it is incremented at the next NMI.
  if (!e.yoshiRunning) return ((clock - 1) & 0x30) ? 19 : 20
  const stride = Math.max(0, clock - palFrame(tick - e.age) - 1)
  return 21 + (stride % 3) + (((clock - 1) & 0x10) ? 3 : 0)
}

export function moveLooseYoshi(world: World, room: LevelDefinition, e: EntityState) {
  const direction = e.facing ?? -1
  if (e.yoshiRunning) e.vx = direction * runSpeed
  e.vy = Math.min(4, e.vy + 0.23)
  const contacts = moveBody(world, room, e)
  if (e.yoshiRunning && (contacts.some(c => c.side === 'left' || c.side === 'right') ||
      e.x <= 0 || e.x >= room.width * 16 - e.width)) {
    e.facing = direction === 1 ? -1 : 1
    e.vx = e.facing * runSpeed
  }
  if (!e.yoshiRunning && e.grounded) {
    e.vx = 0
    e.vy = -5 / 6
  }
}
