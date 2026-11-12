import type { Body } from './types.ts'

// E1 bank 00 uses the small player's side-body and side-head probes at
// native Y + $18 and + $1A, inside the $10..$20 head-to-foot interval.
// A one-tile opening can therefore be entered between two airborne frames.
export function alignToPassage(body: Body, oldX: number, solid: (col: number, row: number) => boolean) {
  if (!('form' in body) || body.form !== 'small' || body.height !== 16 || body.x === oldX) return
  const right = body.x > oldX
  const oldCol = Math.floor((oldX + (right ? body.width - 0.01 : 0)) / 16)
  const col = Math.floor((body.x + (right ? body.width - 0.01 : 0)) / 16)
  if (col === oldCol) return
  const row = Math.floor((body.y + 8) / 16)
  if (Math.floor((body.y + 10) / 16) !== row || solid(col, row)) return
  if (solid(col, row - 1) && solid(col, row + 1)) body.y = row * 16
}
