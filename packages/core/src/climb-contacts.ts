import { tileAt } from './terrain.ts'
import type { LevelDefinition, PlayerState, World } from './types.ts'

export const isNetTile = (tile: number) => tile >= 7 && tile < 0x1d

// PAL $00:E820/$00:E88C. Bits in $8B distinguish the center, head,
// foot and two hand probes. Bit 7 distinguishes grates from vines.
export function climbContacts(world: World, room: LevelDefinition, p: PlayerState) {
  const x = Math.floor(p.x) - 2, y = Math.floor(p.y + p.height) - 32
  const leftSide = (x & 15) >= 8, handX = leftSide ? 2 : 14
  const small = p.height <= 16
  function probe(dx: number, dy: number, bit: number) {
    const tile = tileAt(world, room, (x + dx) >> 4, (y + dy) >> 4)
    if (isNetTile(tile)) return 0x80 | bit
    if (tile === 6) return bit === 1 ? 0x19 : bit
    return 0
  }
  const mask = probe(8, small ? 24 : 18, 1) | probe(8, small ? 16 : 8, 2)
    | probe(leftSide ? 11 : 5, 32, 4) | probe(handX, 26, 0x10) | probe(handX, small ? 22 : 15, 8)
  return {
    touching: mask !== 0, net: !!(mask & 0x80), leftSide,
    center: !!(mask & 1), head: !!(mask & 2), foot: !!(mask & 4),
    bothHands: (mask & 0x18) === 0x18, canGrab: (mask & 0x1b) === 0x1b,
  }
}
