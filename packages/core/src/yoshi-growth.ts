import { spawnEntity, emit } from './state.ts'
import type { World, EntityState, PlayerState } from './types.ts'
import { moveBody, overlaps } from './terrain.ts'
import { collectCoin } from './resources.ts'

export function hatch(world: World, e: EntityState, target: PlayerState) {
  if (e.eggPrize && !e.hatchAt) {
    // A laid egg flies backwards in status 09. Contact with the ground
    // starts the 32-frame hatch timer at 01:F74C.
    moveBody(world, world.campaign.levels[e.roomId], e)
    e.vy = Math.min(4 * 5 / 6, e.vy + 3 / 16 * (5 / 6) ** 2)
    if (e.grounded) e.hatchAt = e.age + Math.ceil(32 * 6 / 5)
  } else if (!e.hatchAt && (e.adultEgg || Math.abs(target.x - e.x) < 32)) e.hatchAt = e.age + 32
  if (e.hatchAt !== e.age) return
  e.active = false
  if (e.eggPrize) {
    spawnEntity(world, e.roomId, { x: e.x, y: e.y, spriteId: e.eggPrize })
    return
  }
  const raised = spawnEntity(world, e.roomId, { x: e.x, y: e.y, spriteId: e.adultEgg ? 0x35 : 0x2d })!
  raised.yoshiColor = e.yoshiColor
  if (e.adultEgg) {
    raised.facing = 1
    raised.yoshiGrowthTick = world.state.tick
  }
}
export function feedBaby(world: World, baby: EntityState, target: PlayerState) {
  if (baby.stunnedUntil && baby.stunnedUntil > baby.age) return
  const food = world.state.entities.find(
    (e) =>
      e !== baby &&
      e !== undefined &&
      e.active &&
      e.roomId === baby.roomId &&
      e.spriteId < 0xc9 &&
      !['cloudCoin', 'fireball', 'yoshiFire', 'chuckShot'].includes(e.kind) &&
      world.campaign.yoshiTraits &&
      !(world.campaign.yoshiTraits[e.spriteId] & 1) &&
      overlaps(e, baby),
  )
  if (!food) return
  food.active = false
  if (food.owner && world.state.players[food.owner].carrying === food.id)
    world.state.players[food.owner].carrying = null
  baby.meals = (baby.meals ?? 0) + 1
  baby.stunnedUntil = baby.age + 32
  if (baby.meals === 5 || (food.spriteId >= 0x74 && food.spriteId <= 0x77)) {
    baby.kind = 'yoshi'
    baby.spriteId = 0x35
    baby.facing = 1
    baby.yoshiGrowthTick = world.state.tick
    baby.vx = 0
    baby.vy = 0
    if (baby.owner && world.state.players[baby.owner].carrying === baby.id)
      world.state.players[baby.owner].carrying = null
    baby.owner = null
    emit(world, 'yoshiGrow', target)
  } else {
    collectCoin(world, target)
    emit(world, 'swallow', target)
  }
}
