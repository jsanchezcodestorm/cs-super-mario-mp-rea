import { tideSurface } from './tide.ts'
import { palFrame } from './pal-time.ts'
import { tileAt } from './terrain.ts'
import type { EntityState, World } from './types.ts'

function inLiquid(world: World, e: EntityState, riderOffset = 0) {
  const room = world.campaign.levels[e.roomId]
  const x = Math.floor(e.x) + 8, y = Math.floor(e.y) + 4 - riderOffset
  const tide = tideSurface(room, world.state)
  return !!room.water || (tide !== null && y >= tide) ||
    tileAt(world, room, Math.floor(x / 16), Math.floor(y / 16)) <= 5
}

function dolphin(e: EntityState, wet: boolean) {
  e.x += e.vx
  e.y += e.vy
  e.vy = Math.min(63 / 16, e.vy + 1 / 16)
  if (!wet || e.vy < 0) return
  // GenerateDolphin sets $151C. Each splash launches an emitted dolphin
  // immediately and preserves the horizontal speed supplied by the generator.
  if (e.emission) {
    e.vy = -4
    return
  }
  e.vy = Math.max(0, e.vy - 0.5)
  const limit = e.spriteId === 0x41 ? 24 : e.spriteId === 0x42 ? 8 : 0
  const direction = e.liftReverse ? 1 : -1
  e.vx += limit ? direction / 16 : 0
  if (e.vx === direction * limit / 16) {
    e.liftReverse = !e.liftReverse
    e.vy = -4
  }
  if (e.vx) e.facing = e.vx < 0 ? -1 : 1
}

export function advanceBuoyantDeck(world: World, e: EntityState) {
  const frame = palFrame(e.age)
  if (e.spriteId >= 0x41 && e.spriteId <= 0x43) {
    dolphin(e, inLiquid(world, e))
    return
  }
  if (e.liftWet === undefined) {
    // The buoyant loader searches downward in eight-pixel increments.
    for (let i = 0; i < 3 && !inLiquid(world, e); i++) e.y += 8
    e.liftWet = inLiquid(world, e)
  }
  const rider = Object.values(world.state.players).find(p => p.status === 'alive' &&
    p.roomId === e.roomId && p.vy >= 0 && Math.abs(p.y + p.height - e.y) < 5 &&
    p.x + p.width > e.x && p.x < e.x + e.width)
  e.y += e.vy
  e.vy = Math.min(4, e.vy + 1 / 16)
  if (e.liftWet && e.vy >= (e.spriteId < 0x5d ? -0.5 : -0.25)) e.vy -= 2 / 16
  if (rider && e.spriteId >= 0x5d && e.vy < (rider.form === 'small' ? 2 : 3) / 16) e.vy += 2 / 16
  if (rider && e.spriteId < 0x5d && rider.vy >= 2) e.vy = Math.floor(rider.vy * 4) / 16
  if (!rider && e.deckRider) {
    const oldRider = world.state.players[e.deckRider]
    if (oldRider.vy < 0 && e.vy < 2) e.vy += (oldRider.form === 'small' ? 6 : 8) / 16
  }
  e.deckRider = rider?.id
  if ((frame & 1) === 0) {
    e.vy -= Math.sign(e.vy) / 16
    e.liftWet = inLiquid(world, e, rider ? rider.form === 'small' ? 2 : 5 : 0)
  }
}
