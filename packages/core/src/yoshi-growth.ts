import { spawnEntity, emit } from './state.ts'
import type { World, EntityState, PlayerState } from './types.ts'
import { overlaps } from './terrain.ts'
import { collectCoin } from './resources.ts'

export function hatch(world: World, e: EntityState, target: PlayerState) {
  if (!e.hatchAt && (e.adultEgg || Math.abs(target.x - e.x) < 32)) e.hatchAt = e.age + 32
  if (e.hatchAt !== e.age) return
  e.active = false
  const raised = spawnEntity(world, e.roomId, { x: e.x, y: e.y, spriteId: e.adultEgg ? 0x35 : 0x2d })!
  raised.yoshiColor = e.yoshiColor
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
      !['fireball', 'yoshiFire', 'chuckShot'].includes(e.kind) &&
      world.campaign.yoshiTraits &&
      !(world.campaign.yoshiTraits[e.spriteId] & 1) &&
      overlaps(e, baby),
  )
  if (!food) return
  food.active = false
  baby.meals = (baby.meals ?? 0) + 1
  baby.stunnedUntil = baby.age + 32
  if (baby.meals === 5 || (food.spriteId >= 0x74 && food.spriteId <= 0x77)) {
    baby.kind = 'yoshi'
    baby.spriteId = 0x35
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
