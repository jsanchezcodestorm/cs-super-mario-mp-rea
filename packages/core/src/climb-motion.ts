import { emit } from './state.ts'
import type { PlayerState, World } from './types.ts'

// E1 scales only the vertical component of player speed by $128/$100.
export const climbStepY = 1 + 0x28 / 256

export function jumpFromClimb(world: World, p: PlayerState, water = false) {
  // $B0 on land, $F0 in water, converted to the 60 Hz airborne integrator.
  p.vy = (water ? -1 : -5) * climbStepY * 5 / 6
  emit(world, 'jump', p)
}
