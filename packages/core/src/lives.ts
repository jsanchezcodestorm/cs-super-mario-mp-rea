import type { GameState, PlayerState } from './types.ts'
import { playerIds } from './types.ts'

const maxLives = 99

export function setSharedLives(state: GameState, lives: number) {
  const sharedLives = Math.max(0, Math.min(maxLives, lives))
  state.sharedLives = sharedLives
  for (const id of playerIds) state.players[id].lives = sharedLives
  return sharedLives
}

export function awardLives(state: GameState, player: PlayerState, amount: number) {
  if (state.mode === 'coop') {
    const current = state.sharedLives ?? Math.min(maxLives, state.players.mario.lives + state.players.luigi.lives)
    return setSharedLives(state, current + amount)
  }
  player.lives = Math.min(maxLives, player.lives + amount)
  return player.lives
}

export function loseLife(state: GameState, player: PlayerState) {
  if (state.mode === 'coop') {
    const current = state.sharedLives ?? Math.min(maxLives, state.players.mario.lives + state.players.luigi.lives)
    return setSharedLives(state, current - 1)
  }
  player.lives = Math.max(0, player.lives - 1)
  return player.lives
}
