import { freeCloud } from './lakitu.ts'
import { palFrame } from './pal-time.ts'
import type { EntityState, World } from './types.ts'

const puffDefeats = new Set([0x1a, 0x1d, 0x20, 0x2a, 0x4f, 0x50, 0x99])
const puffDuration = 28
const knockbackStep = 5 / 6
const knockbackGravity = 3 / 16

export function beginEntityDefeat(world: World, e: EntityState, direction: -1 | 1) {
  if (e.defeat) return
  if (e.owner && world.state.players[e.owner].carrying === e.id)
    world.state.players[e.owner].carrying = null
  if (e.kind === 'lakitu') freeCloud(world, e)
  e.active = false
  e.defeat = { kind: puffDefeats.has(e.spriteId) || e.kind === 'throwBlock' ? 'puff' : 'tumble', tick: world.state.tick }
  if (e.defeat.kind === 'tumble') {
    e.grounded = false
    e.vx = direction * knockbackStep
    e.vy = -3 * knockbackStep
  }
}

export function advanceEntityDefeat(world: World, e: EntityState) {
  if (!e.defeat) return
  const elapsed = palFrame(world.state.tick) - palFrame(e.defeat.tick)
  e.age++
  if (e.defeat.kind === 'puff') {
    if (elapsed >= puffDuration) delete e.defeat
    return
  }
  const room = world.campaign.levels[e.roomId]
  e.x += e.vx
  e.y += e.vy
  e.vy = Math.min(4 * knockbackStep, e.vy + knockbackGravity * knockbackStep ** 2)
  if (e.y > room.height * 16 + 16) delete e.defeat
}
