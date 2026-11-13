import { isBlockBridge } from './bridges.ts'
import { clipDisplacement } from './terrain.ts'
import { liftSurfaceY } from './travelling-lifts.ts'
import { deckBounds, type DeckBounds, type PreviousFoot } from './deck-bounds.ts'
import type { EntityState, PlayerState, World } from './types.ts'

export function standOnDeck(world: World, p: PlayerState, deck: EntityState) {
  const target = liftSurfaceY(deck, p) - p.height
  p.y = clipDisplacement(world, world.campaign.levels[p.roomId], p, 'y', target - p.y)
  p.grounded = Math.abs(p.y - target) < 0.001
  p.vy = 0
  if (p.grounded) {
    deck.owner = p.id
    deck.riderTick = world.state.tick
    p.layer2Ground = false
  }
}

// Both bodies move during a simulation tick. Test their horizontal overlap at
// the instant the feet cross the surface, including a lift rising to meet them.
export function landOnMovingDeck(world: World, deck: EntityState, p: PlayerState, foot: PreviousFoot, old: DeckBounds) {
  const box = deckBounds(deck)
  const from = foot.bottom - liftSurfaceY(deck, foot, old.x - (box.x - deck.x), old.y)
  const to = p.y + p.height - liftSurfaceY(deck, p)
  if (from > 0 || to < 0 || p.vy < 0) return false
  const t = to === from ? 1 : -from / (to - from)
  const x = foot.x + (p.x - foot.x) * t, left = old.x + (box.x - old.x) * t
  const width = old.width + (box.width - old.width) * t
  if (x + p.width <= left || x >= left + width || p.x + p.width <= box.x || p.x >= box.x + box.width) return false
  standOnDeck(world, p, deck)
  return p.grounded
}

export function carryDeckRider(
  world: World, deck: EntityState, p: PlayerState, foot: PreviousFoot, old: DeckBounds,
) {
  if (p.behindNet || p.vy < 0) return false
  const box = deckBounds(deck)
  const previousSurface = liftSurfaceY(deck, foot, old.x - (box.x - deck.x), old.y)
  if (Math.abs(foot.bottom - previousSurface) > 0.001 || foot.x + p.width <= old.x || foot.x >= old.x + old.width) return false
  let shift = box.x - old.x
  if (isBlockBridge(deck)) shift = 0
  if (deck.spriteId === 0x61) shift = Math.floor(deck.x) - Math.floor(old.x)
  const x = clipDisplacement(world, world.campaign.levels[p.roomId], p, 'x', shift)
  if (x + p.width <= box.x || x >= box.x + box.width) return false
  p.x = x
  standOnDeck(world, p, deck)
  return true
}
