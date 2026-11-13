import { isBodyFree } from './terrain.ts'
import type { PlayerState, PowerForm, World } from './types.ts'

export function changePlayerForm(world: World, player: PlayerState, form: PowerForm) {
  if (player.form === form) return
  player.formChange = { from: player.form, to: form, tick: world.state.tick }
  player.form = form
}

function resizeAtFeet(world: World, player: PlayerState, height: number) {
  if (height === player.height) return true
  const room = world.campaign.levels[player.roomId]
  const next = { ...player, y: player.y + player.height - height, height }
  if (height > player.height && !isBodyFree(world, room, next)) return false
  player.y = next.y
  player.height = height
  return true
}

export function expandPlayer(world: World, player: PlayerState) {
  if (player.form === 'small') return true
  const height = player.ducking ? duckHeight(player) : 28
  player.growthPending = !resizeAtFeet(world, player, height)
  return !player.growthPending
}

export function resumePlayerGrowth(world: World, player: PlayerState) {
  if (player.growthPending) expandPlayer(world, player)
}

function duckHeight(player: PlayerState) {
  // The mounted tile probes move the head from native Y+$10 to Y+$13.
  return player.mounted && player.form !== 'small' ? 25 : 16
}

/** A ground duck latches through a jump. Releasing below a ceiling keeps the short body. */
export function duckPlayer(world: World, player: PlayerState, down: boolean, canDuck: boolean) {
  const crouch = canDuck && (player.grounded ? down : !!player.ducking)
  if (crouch) {
    player.ducking = true
    resizeAtFeet(world, player, duckHeight(player))
  } else if (player.ducking && resizeAtFeet(world, player, player.form === 'small' ? 16 : 28)) {
    delete player.ducking
  }
}

// E1 GetMarioClipping selects the small clipping box when $73 is set.
// Sprite contacts and terrain probes have separate bounds in the cartridge.
export function playerContactBody(player: PlayerState) {
  if (!player.ducking) return player
  const height = player.mounted ? 24 : 12
  return { x: player.x, y: player.y + player.height - height, width: player.width, height }
}
