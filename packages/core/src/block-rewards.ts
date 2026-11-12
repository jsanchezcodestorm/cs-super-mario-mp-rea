import type { PlayerState } from './types.ts'

/** Bank 00, IntBlk_Powerup. Low bit selects the small-Mario/active-star variant. */
const contents = [
  0x80, 0, 0, 0x1e, 0, 0, 5, 9, 6, 0x81, 0x0e, 0x0c, 0x14, 0, 5, 9, 6, 7, 0x0e, 0x0c, 0x16, 0x18, 0x1a, 0x1a,
  0, 9, 0, 0, 0xff, 0x0c, 0x0a, 0, 0, 0, 8, 2,
]
const noteContents = [5, 9, 6, 5, 9, 6, 5, 9, 6, 5, 9, 6, 5, 9, 6, 5]
const turnContents = [7, 10, 16, 7, 10, 16, 7, 10, 16, 7, 10, 16, 7, 10, 16, 7]
const sprites = [0, 0x74, 0x75, 0x76, 0x77, 0x78, 0, 0, 0x79, 0, 0x3e, 0x7d, 0x2c, 4, 0x81, 0x45, 0x80]
export function blockReward(tile: number, col: number, p: PlayerState, coins: number) {
  const index = tile >= 0x16a ? tile - 0x148 : tile < 0x100 ? tile - 4 : tile - 0x111
  let value = contents[index]
  if (value === undefined) return null
  if (value === 0xff) value = coins >= 30 ? 10 : 12
  if (value === 0x80 || value === 0x81) value = (value === 0x80 ? noteContents : turnContents)[col & 15]
  let item = value >> 1
  if ((value & 1) !== 0) {
    if (item === 3 && !p.star) item = 6
    else if (item !== 3 && p.form === 'small') item = 1
  }
  if (item === 11) return [0x80, 0x7e, 0x7d, 0x80][col & 3]
  return item === 6 || item === 7 ? 'coin' : sprites[item] || null
}
