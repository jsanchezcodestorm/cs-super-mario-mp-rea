import { AIR, TILE, changeTile, overlaps } from './terrain.ts'
import { startBlockBounce } from './block-bounce.ts'
import { activePlayerIds, playerIds, type LevelDefinition, type PlayerState, type World } from './types.ts'

/** Reload the room's original turn blocks once no other player occupies it. */
export function reloadTurnBlocks(world: World, room: LevelDefinition, entering: PlayerState) {
  const { state } = world
  const changes = state.tileChanges[room.id]
  if (!changes || activePlayerIds(state).some(id => id !== entering.id &&
    state.players[id].roomId === room.id && state.players[id].status === 'alive')) return
  for (const index of Object.keys(changes).map(Number)) {
    if (room.tiles[index] === 0x11e && changes[index] === AIR) delete changes[index]
  }
  state.turning = state.turning.filter(b => b.roomId !== room.id)
  if (state.bouncingBlocks) state.bouncingBlocks = state.bouncingBlocks.filter(b => b.roomId !== room.id || b.tile !== 0x11e)
  if (state.shatteredBlocks) state.shatteredBlocks = state.shatteredBlocks.filter(b => b.roomId !== room.id)
}

export function startTurnBlock(world: World, room: LevelDefinition, col: number, row: number) {
  const tick = world.state.tick
  startBlockBounce(world, room, col, row, 0x11e, AIR)
  const until = tick + 155
  world.state.turning.push({ roomId: room.id, col, row, until })
}

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
