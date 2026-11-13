import { emit } from './state.ts'
import type { PlayerState, World } from './types.ts'

// E1 scales only the vertical component of player speed by $128/$100.
export const climbStepY = 1 + 0x28 / 256

// E1 climbing collision probes sit below the top of the standing box.
// Feet stop 15 px (small) or 22–23 px (powered up) below a solid lintel.
export function climbingHeadInset(height: number) {
  return height <= 16 ? 1 : height - 22
}

export function jumpFromClimb(world: World, p: PlayerState, water = false) {
  // $B0 on land, $F0 in water, converted to the 60 Hz airborne integrator.
  p.vy = (water ? -1 : -5) * climbStepY * 5 / 6
  emit(world, 'jump', p)
}
