import { isBodyFree } from './terrain.ts'
import type { PlayerState, World } from './types.ts'

const poweredHeight = 28

/** Grow upward only when the expanded body clears both terrain layers. */
export function expandPlayer(world: World, player: PlayerState) {
  if (player.height >= poweredHeight) {
    player.growthPending = false
    return true
  }
  const room = world.campaign.levels[player.roomId]
  const height = poweredHeight
  const next = { ...player, y: player.y + player.height - height, height }
  if (!isBodyFree(world, room, next)) {
    player.growthPending = true
    return false
  }
  player.y = next.y
  player.height = height
  player.growthPending = false
  return true
}

export function resumePlayerGrowth(world: World, player: PlayerState) {
  if (player.growthPending) expandPlayer(world, player)
}
