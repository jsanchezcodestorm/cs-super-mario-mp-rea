import { giveBlockCoin, startBlockBounce } from './block-bounce.ts'
import { spawnBlockReward } from './state.ts'
import { changeTile, tileAt, USED } from './terrain.ts'
import { activePlayerIds, type LevelDefinition, type PlayerState, type World } from './types.ts'

const QUESTION = 0x124
const CORRECT = 0x15e

/** PAL E1 $00:F1E9. A row is shared between both players and can yield one mushroom. */
export function hitBonusQuestion(world: World, p: PlayerState, room: LevelDefinition, col: number, row: number) {
  if (tileAt(world, room, col, row) !== QUESTION) return
  const visit = world.state.questionBonus ??= { roomId: room.id, closed: false }
  const remaining = []
  let rowSize = 0
  for (let x = 0; x < room.width; x++) {
    if (room.tiles[row * room.width + x] !== QUESTION) continue
    rowSize++
    if (tileAt(world, room, x, row) === QUESTION) remaining.push(x)
  }
  const third = remaining.length === 1
  const mask = remaining.length === rowSize ? 3 : 1
  const frame = Math.floor(world.state.tick * 5 / 6)
  const correct = visit.roomId === room.id && !visit.closed && (third || (frame & mask) !== 0)
  startBlockBounce(world, room, col, row, QUESTION, correct ? CORRECT : USED)
  if (!correct) {
    for (const x of remaining) if (x !== col) changeTile(world, room, x, row, USED)
  } else if (third) {
    spawnBlockReward(world, room.id, { x: col * 16, y: (row - 1) * 16, spriteId: 0x78 })
  } else {
    giveBlockCoin(world, p, room, col, row)
  }
}

/** E1 sets $141B when leaving an attempted room. In co-op the visit lasts until both players leave. */
export function leaveQuestionBonus(world: World, p: PlayerState, destination: string) {
  const { state } = world
  const visit = state.questionBonus
  if (!visit || visit.roomId !== p.roomId || p.roomId === destination) return
  if (activePlayerIds(state).some((id) => id !== p.id && state.players[id].status === 'alive' &&
    state.players[id].roomId === p.roomId)) return
  visit.closed = true
  const changes = state.tileChanges[p.roomId]
  if (changes) {
    const room = world.campaign.levels[p.roomId]
    for (const index of Object.keys(changes).map(Number)) if (room.tiles[index] === QUESTION) delete changes[index]
  }
  if (state.bouncingBlocks) {
    state.bouncingBlocks = state.bouncingBlocks.filter((b) => b.roomId !== p.roomId || b.tile !== QUESTION)
  }
}
