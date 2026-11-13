import { clipDisplacement } from './terrain.ts'
import { deckBounds, type DeckBounds, type PreviousFoot } from './deck-bounds.ts'
import type { EntityState, PlayerState, World } from './types.ts'

// InvisBlkMainRt consults the passable flag. The growing pipe, hammer
// platform and castle block also collide from the sides and from underneath.
export function hitSolidDeck(world: World, e: EntityState, p: PlayerState, foot: PreviousFoot, old: DeckBounds) {
  if (e.spriteId !== 0x49 && e.spriteId !== 0x9c && e.spriteId !== 0xbb) return
  const room = world.campaign.levels[e.roomId]
  const box = deckBounds(e), base = box.y + box.height
  if (p.y >= base || p.y + p.height <= e.y) return
  // Clipping profiles $1D and $2F occupy the inner 28 px of the solid block.
  const left = box.x, right = left + box.width, dx = p.x - foot.x - (box.x - old.x)
  if (p.x + p.width <= left || p.x >= right) return
  if (foot.bottom - p.height >= old.y + old.height) {
    p.y = clipDisplacement(world, room, p, 'y', base - p.y)
    p.vy = Math.max(0, p.vy)
    return 'head'
  }
  let side: number
  if (dx > 0 && foot.x + p.width <= old.x) side = left - p.width
  else if (dx < 0 && foot.x >= old.x + old.width) side = right
  else return
  p.x = clipDisplacement(world, room, p, 'x', side - p.x)
  p.vx = 0
  return 'side'
}
