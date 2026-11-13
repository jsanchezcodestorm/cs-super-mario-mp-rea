import { palFrame } from './pal-time.ts'
import { AIR, changeTile } from './terrain.ts'
import type { EntityState, World } from './types.ts'

export interface ScalePair {
  partner: string
  right: boolean
  // Only the left pan maintains the PAL accumulator shared by both sides.
  balance?: { tick: number; position: number; speed: number }
}

export function pairScalePans(left: EntityState, right: EntityState) {
  const span = left.origin.x & 16 ? 64 : 128
  right.x += span
  for (const pan of [left, right]) {
    pan.width = 32
    pan.x -= 8
    pan.vx = pan.vy = 0
  }
  left.scale = { partner: right.id, right: false, balance: { tick: -1, position: 0, speed: 0 } }
  right.scale = { partner: left.id, right: true }
}

export function moveScalePan(world: World, pan: EntityState) {
  const { state } = world
  const pair = pan.scale!
  const other = state.entities.find(e => e.id === pair.partner)!
  const left = pair.right ? other : pan, right = pair.right ? pan : other
  const balance = left.scale!.balance!
  if (balance.tick !== state.tick && palFrame(state.tick) !== palFrame(state.tick - 1)) {
    balance.tick = state.tick
    const onLeft = left.riderTick === state.tick - 1, onRight = right.riderTick === state.tick - 1
    const displacement = Math.floor(balance.position / 16)
    if (onLeft !== onRight || (!onLeft && displacement !== 0)) {
      // ScalePlatformMain advances with the previous speed, then selects the
      // next speed. The other pan moves by the opposite whole-pixel delta.
      balance.position += balance.speed
      balance.speed = onLeft ? 8 : onRight ? -8 : -2 * Math.sign(displacement)
    } else balance.speed = 0 // Two occupied pans balance in co-op.
  }
  const before = pan.y, sign = pair.right ? -1 : 1
  pan.y = pan.origin.y + sign * Math.floor(balance.position / 16)
  pan.vy = pan.y - before
  // The native routine generates the tile at the pan's pre-move position.
  const direction = balance.speed * sign
  if (!direction || (before & 15)) return
  const room = world.campaign.levels[pan.roomId], col = (pan.x + 8) >> 4
  const row = before >> 4
  if (row >= 0 && row < room.height) changeTile(world, room, col, row, direction > 0 ? AIR : 0xa2)
}
