import { palFrame } from './pal-time.ts'
import type { EntityState } from './types.ts'

export function keyholeAnchor(hole: EntityState) {
  // Sprite $0E shifts +8 during INIT and centers its 8-pixel graphic at +4.
  return { x: hole.origin.x + 12, y: hole.origin.y + 16 }
}

/** E1 $00:C47E expands by four, holds for $30 frames, retracts and fades to the map. */
export function keyholeFrame(start: number, tick: number) {
  const age = palFrame(tick) - palFrame(start)
  const closing = age > 84
  const size = closing ? Math.max(0, 144 - (age - 84) * 4) : Math.min(144, age * 4)
  const darken = Math.min(15, Math.max(0, Math.floor((age - 122) / 2)))
  return { size, closing, darken, finished: age > 152 }
}
