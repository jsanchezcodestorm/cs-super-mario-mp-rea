import { isBodyFree, isSolid, TILE, tileAt } from './terrain.ts'
import { slopeHeight } from './slopes.ts'
import type { Body, LevelDefinition, World } from './types.ts'

/** The native feet are six pixels apart. The wider web body must clear the lip
 * of a turn block when both probes have already entered the adjacent opening. */
export function alignSpinDrop(world: World, room: LevelDefinition, body: Body) {
  const feet = body.y + body.height
  const row = Math.floor((feet + body.vy) / TILE)
  if (feet > row * TILE) return
  const center = Math.floor(body.x + body.width / 2)
  const col = Math.floor((center - 3) / TILE)
  if (Math.floor((center + 3) / TILE) !== col) return
  const left = col * TILE, right = left + TILE - body.width
  const x = Math.max(left, Math.min(right, body.x))
  if (x === body.x || tileAt(world, room, col + (x < body.x ? 1 : -1), row) !== 0x11e) return
  const tile = tileAt(world, room, col, row)
  if (isSolid(tile) || (tile >= 0x100 && tile < 0x111) || slopeHeight(world, room, tile, center & 15) !== null) return
  if (isBodyFree(world, room, { ...body, x })) body.x = x
}

// E1 bank 00 uses the small player's side-body and side-head probes at
// native Y + $18 and + $1A, inside the $10..$20 head-to-foot interval.
// A one-tile opening can therefore be entered between two airborne frames.
export function alignToPassage(body: Body, oldX: number, solid: (col: number, row: number) => boolean) {
  if (!('form' in body) || (body.form !== 'small' && !('ducking' in body && body.ducking)) || body.height !== 16 || body.x === oldX) return
  const right = body.x > oldX
  const oldCol = Math.floor((oldX + (right ? body.width - 0.01 : 0)) / 16)
  const col = Math.floor((body.x + (right ? body.width - 0.01 : 0)) / 16)
  if (col === oldCol) return
  const row = Math.floor((body.y + 8) / 16)
  if (Math.floor((body.y + 10) / 16) !== row || solid(col, row)) return
  if (solid(col, row - 1) && solid(col, row + 1)) body.y = row * 16
}
