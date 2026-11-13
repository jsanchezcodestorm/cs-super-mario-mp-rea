import type { EntityState } from './types.ts'

export type DeckBounds = Pick<EntityState, 'x' | 'y' | 'width' | 'height'>
export type PreviousFoot = { x: number; bottom: number }

// E1 GetSpriteClipping profiles used by the decks whose artwork projects
// beyond the contact rectangle. Other decks store their support width directly.
export function deckBounds(e: EntityState): DeckBounds {
  switch (e.spriteId) {
    case 0x41: case 0x42: return { x: e.x + 2, y: e.y, width: 36, height: e.height }
    case 0x43: return { x: e.x, y: e.y, width: 15, height: e.height }
    case 0x49: case 0x9c: case 0xba: return { x: e.x + 2, y: e.y, width: 28, height: 24 }
    case 0xbb: return { x: e.x + 2, y: e.y, width: 28, height: 30 }
    case 0xb7: case 0xb8: return { x: e.x + 2, y: e.y, width: 28, height: e.height }
    default: return { x: e.x, y: e.y, width: e.width, height: e.height }
  }
}
