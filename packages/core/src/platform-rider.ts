import { isBlockBridge } from './bridges.ts'
import { clipDisplacement } from './terrain.ts'
import type { EntityState, PlayerState, World } from './types.ts'

export function standOnDeck(world: World, p: PlayerState, deck: EntityState) {
  const target = deck.y - p.height
  p.y = clipDisplacement(world, world.campaign.levels[p.roomId], p, 'y', target - p.y)
  p.grounded = Math.abs(p.y - target) < 0.001
  p.vy = 0
  if (p.grounded) deck.owner = p.id
}

export function carryDeckRider(
  world: World, deck: EntityState, p: PlayerState, foot: number, oldX: number, oldY: number, oldWidth: number,
) {
  if (p.vy < 0 || Math.abs(foot - oldY) >= 1 || p.x + p.width <= oldX || p.x >= oldX + oldWidth) return false
  let shift = deck.x - oldX
  if (isBlockBridge(deck)) shift = 0
  if (deck.spriteId === 0x61) shift = Math.floor(deck.x) - Math.floor(oldX)
  const x = clipDisplacement(world, world.campaign.levels[p.roomId], p, 'x', shift)
  if (x + p.width <= deck.x || x >= deck.x + deck.width) return false
  p.x = x
  standOnDeck(world, p, deck)
  return true
}
