import { TILE, changeTile, overlaps } from './terrain.ts'
import { playerIds, type World } from './types.ts'

/** A turning block closes on the first free tick after its spin timer expires. */
export function settleTurnBlocks(world: World) {
  const { state, campaign } = world
  state.turning = state.turning.filter((block) => {
    if (state.tick < block.until) return true
    const tile = { x: block.col * TILE, y: block.row * TILE, width: TILE, height: TILE }
    const occupied = playerIds.some((id) => {
      const p = state.players[id]
      return p.status === 'alive' && p.roomId === block.roomId && overlaps(p, tile)
    })
    if (occupied) return true
    changeTile(world, campaign.levels[block.roomId], block.col, block.row, 0x11e)
    return false
  })
}
