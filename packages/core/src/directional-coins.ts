import { Buttons, type EntityState, type LevelDefinition, type World } from './types.ts'
import { AIR, changeTile, tileAt } from './terrain.ts'

const velocities = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const
// E1 bank 02, DATA_02E201. Indices use the SNES D-pad bit order (UDLR).
const turns = [0, 3, 2, 0, 1, 3, 2, 0, 0, 3, 2, 0, 0, 0, 0, 0] as const

export function guideCoins(world: World, room: LevelDefinition, coin: EntityState, input: number) {
  const current = coin.coinDirection ?? 0
  const [dx, dy] = velocities[current]
  const pad = ((input & Buttons.up) << 1) | ((input & Buttons.down) >> 1)
    | ((input & Buttons.left) << 1) | ((input & Buttons.right) >> 1)
  if (pad && turns[pad] !== (current ^ 1)) coin.coinTurn = turns[pad]

  // DirectCoinTimer starts at zero and wraps to FF on its first four-frame decrement.
  if (coin.age >= 1021 && world.state.tick % 4 === 0) {
    coin.active = false
    return
  }
  if (coin.x % 16 === 0 && coin.y % 16 === 0) {
    const col = coin.x / 16 + dx, row = coin.y / 16 + dy
    if (col < 0 || row < 0 || col >= room.width || row >= room.height || tileAt(world, room, col, row) !== AIR) {
      coin.active = false
      return
    }
  }
  coin.x += dx
  coin.y += dy
  if (coin.x % 16 === 0 && coin.y % 16 === 0) {
    changeTile(world, room, coin.x / 16, coin.y / 16, 0x2b)
    coin.coinDirection = coin.coinTurn ?? current
  }
}
