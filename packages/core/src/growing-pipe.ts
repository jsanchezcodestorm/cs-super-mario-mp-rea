import { AIR, changeTile } from './terrain.ts'
import type { EntityState, PlayerState, World } from './types.ts'

function pipeRow(world: World, e: EntityState, y: number, extend: boolean) {
  const room = world.campaign.levels[e.roomId]
  const col = Math.floor(e.origin.x / 16), row = Math.floor(y / 16)
  changeTile(world, room, col, row, extend ? 0x168 : AIR)
  changeTile(world, room, col + 1, row, extend ? 0x169 : AIR)
}

export function advanceGrowingPipe(world: World, e: EntityState, target: PlayerState) {
  if (e.liftStep === undefined) {
    e.liftStep = 0
    // The INIT routine clears five pairs of pipe tiles from top to bottom.
    for (let offset = 64; offset >= 0; offset -= 16) pipeRow(world, e, e.y - offset, false)
  }
  if (target.x < e.x - 80 || target.x >= e.x + 80) return
  const t = e.liftStep, phase = t < 32 ? 0 : t < 96 ? 1 : t < 128 ? 2 : 3
  e.liftStep = (t + 1) % 192
  // The frame which changes phase does not move the cap.
  e.vy = (t !== 95 && phase === 1) ? -1 : (t !== 191 && phase === 3) ? 1 : 0
  if (e.vy && e.y % 16 === 0) pipeRow(world, e, e.y, e.vy < 0)
  e.y += e.vy
}
