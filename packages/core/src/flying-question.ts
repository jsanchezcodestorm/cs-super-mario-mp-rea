import { givePoppingCoin } from './block-bounce.ts'
import { standOnDeck } from './platform-rider.ts'
import { spawnEntity } from './state.ts'
import { clipDisplacement, overlaps } from './terrain.ts'
import type { EntityState, PlayerId, PlayerState, World } from './types.ts'

export function triggerFlyingQuestion(world: World, block: EntityState, playerId: PlayerId | null) {
  if (block.questionHit) return
  block.questionHit = { tick: world.state.tick, playerId, paid: false }
  block.vx = block.vy = 0
  world.state.events.push({ type: 'block', tick: world.state.tick, roomId: block.roomId, playerId: playerId ?? undefined })
}

function releaseReward(world: World, block: EntityState, player: PlayerState) {
  // InitFlying_Block indexes the original spawn column, even after the sprite has moved.
  const index = (block.origin.x >> 4) & 3
  if (index === 0) givePoppingCoin(world, player, block.roomId, block.x, block.y - 16)
  else {
    const items = player.form === 'small' ? [0x74, 0x74, 0x78] : [0x75, 0x77, 0x78]
    spawnEntity(world, block.roomId, { spriteId: items[index - 1], x: block.x, y: block.y - 16 })
  }
}

export function moveFlyingQuestion(world: World, block: EntityState, nearest: PlayerState) {
  const hit = block.questionHit
  if (hit) {
    if (!hit.paid && world.state.tick - hit.tick >= 10) {
      hit.paid = true
      releaseReward(world, block, hit.playerId ? world.state.players[hit.playerId] : nearest)
    }
    return
  }
  const frame = Math.floor(block.age * 5 / 6)
  if (frame === Math.floor((block.age - 1) * 5 / 6)) return
  const flight = block.questionFlight ??= { xSpeed: 0, ySpeed: 0, ax: -1, ay: -1, hold: 0 }
  if (frame % 2 === 0) {
    flight.ySpeed += flight.ay
    if (Math.abs(flight.ySpeed) === 12) flight.ay *= -1
  }
  if (block.spriteId === 0x83) flight.xSpeed = -12
  else if (flight.hold > 0) flight.hold--
  else if (frame % 4 === 0) {
    flight.xSpeed += flight.ax
    if (Math.abs(flight.xSpeed) === 16) {
      flight.ax *= -1
      flight.hold = 32
    }
  }
  block.vx = flight.xSpeed / 16
  block.vy = flight.ySpeed / 16
  block.x += block.vx
  block.y += block.vy
}

export function touchFlyingQuestion(world: World, block: EntityState, p: PlayerState, oldBottom: number) {
  if (!overlaps(p, block)) return
  if (p.vy >= 0 && oldBottom <= block.y + 2) {
    standOnDeck(world, p, block)
    return
  }
  const room = world.campaign.levels[p.roomId]
  const base = block.y + block.height
  if (p.vy < 0 && oldBottom - p.height >= base - 2) {
    p.y = clipDisplacement(world, room, p, 'y', base - p.y)
    p.vy = 5 / 6
    triggerFlyingQuestion(world, block, p.id)
  } else {
    const x = p.x + p.width / 2 < block.x + block.width / 2 ? block.x - p.width : block.x + block.width
    p.x = clipDisplacement(world, room, p, 'x', x - p.x)
    p.vx = 0
  }
}
