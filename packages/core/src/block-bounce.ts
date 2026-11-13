import { addRewardEffect } from './reward-effects.ts'
import { collectCoin } from './resources.ts'
import { addScore } from './rewards.ts'
import { palFrame } from './pal-time.ts'
import { changeTile } from './terrain.ts'
import type { BlockBounce, LevelDefinition, PlayerState, World } from './types.ts'

const ticksPerPalFrame = 60 / 50
const multicoin = (tile: number) => tile === 0x11b || tile === 0x123

export function startBlockBounce(world: World, room: LevelDefinition, col: number, row: number, tile: number, replacement?: number) {
  const { state } = world
  const bounce: BlockBounce = { roomId: room.id, col, row, tile, replacement, tick: state.tick }
  const bouncing = state.bouncingBlocks ??= []
  bouncing.push(bounce)
  if (multicoin(tile)) {
    const timers = state.multicoinUntil ??= {}
    timers[room.id] ??= state.tick + Math.ceil(254 * ticksPerPalFrame)
  }
  changeTile(world, room, col, row, 0x152)
}

export function settleBlockBounces(world: World) {
  const { state } = world
  if (!state.bouncingBlocks?.length) return
  state.bouncingBlocks = state.bouncingBlocks.filter((b) => {
    const visible = b.tile === 0x11e
      ? palFrame(state.tick) - palFrame(b.tick) < 6
      : state.tick - b.tick < Math.ceil(7 * ticksPerPalFrame)
    if (visible) return true
    let replacement = b.replacement ?? 0x132
    if (multicoin(b.tile)) {
      const timers = state.multicoinUntil!
      if (timers[b.roomId] === undefined || state.tick < timers[b.roomId]) replacement = b.tile
      else delete timers[b.roomId]
    }
    changeTile(world, world.campaign.levels[b.roomId], b.col, b.row, replacement)
    return false
  })
}

export function giveBlockCoin(world: World, player: PlayerState, room: LevelDefinition, col: number, row: number) {
  givePoppingCoin(world, player, room.id, col * 16, (row - 1) * 16)
}

export function givePoppingCoin(world: World, player: PlayerState, roomId: string, x: number, y: number) {
  collectCoin(world, player)
  addScore(player, 10)
  addRewardEffect(world.state, { roomId, x, y, tick: world.state.tick, award: 10, fromBlock: true })
}
