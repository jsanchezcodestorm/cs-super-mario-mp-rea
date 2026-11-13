import type { GameState } from './types.ts'

// One pass through the two-byte E1 GetRand state at $01:AD07.
export function randomByte(state: { seed: number }) {
  const a = (5 * (state.seed & 255) + 1) & 255
  const old = state.seed >> 8
  const feedback = Number(!(((old >> 7) ^ (old >> 4)) & 1))
  const b = ((old << 1) | feedback) & 255
  state.seed = a | (b << 8)
  return a ^ b
}

export function nextSpriteRandom(state: GameState) {
  const rng = { seed: state.spriteSeed ?? 0 }
  randomByte(rng)
  const value = randomByte(rng)
  state.spriteSeed = rng.seed
  return value
}
