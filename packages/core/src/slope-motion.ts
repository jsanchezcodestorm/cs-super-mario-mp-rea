import { standingSlopeProfile } from './slopes.ts'
import { Buttons, type LevelDefinition, type PlayerState, type World } from './types.ts'
import { limit } from './terrain.ts'

const palFrame = 50 / 60

function approachPalSpeed(current: number, acceleration: number, target: number) {
  const delta = Math.abs(acceleration) * palFrame * palFrame
  return current + limit(target * palFrame - current, -delta, delta)
}

// E1 integrates the previous frame's signed 4.4 speed, then updates the
// internal 4.12 accumulator. Five sixths of a PAL frame elapse per server tick.
function advanceSlide(p: PlayerState, motion: [number, number] | null) {
  let { speed, sixths } = p.sliding ?? { speed: p.vx / palFrame, sixths: 0 }
  const [acceleration, target] = motion ?? [0, speed]
  let distance = 0
  for (let budget = 5; budget > 0;) {
    const slice = Math.min(budget, 6 - sixths)
    distance += Math.floor(speed * 16) / 16 * slice / 6
    budget -= slice
    sixths += slice
    if (sixths === 6) {
      sixths = 0
      speed += limit(target - speed, -Math.abs(acceleration), Math.abs(acceleration))
    }
  }
  p.vx = distance
  if (!speed && target === 0 && p.grounded) delete p.sliding
  else p.sliding = { speed, sixths }
}

/** A slide keeps its momentum after Down is released, including across a crest
 * or onto flat ground. A directional input or a fresh jump ends the slide. */
export function slopeMotion(
  world: World, room: LevelDefinition, p: PlayerState, input: number, pressed: number, water: boolean,
) {
  const direction = input & (Buttons.left | Buttons.right)
  if (water || p.mounted || p.carrying || p.cloud || p.balloon || p.flight || pressed & (Buttons.jump | Buttons.spin)) {
    delete p.sliding
    return false
  }
  if (direction) delete p.sliding
  const walking = direction && !(input & Buttons.run) && direction !== (Buttons.left | Buttons.right)
  if (!walking && !p.sliding && (!(input & Buttons.down) || direction)) return false
  const profile = standingSlopeProfile(world, room, p)
  const motion = profile === null ? null : world.campaign.slopes!.motion[profile]
  if (walking && motion?.slide) {
    const [acceleration, target] = motion.walk[direction === Buttons.right ? 1 : 0]
    p.vx = approachPalSpeed(p.vx, acceleration, target)
    return true
  }
  if (!p.sliding && !(motion?.slide && input & Buttons.down)) return false
  // On flat ground the PAL dry friction word is ±0x0140 (00:D26D).
  advanceSlide(p, motion?.slide ?? (p.grounded ? [0x140 / 4096, 0] : null))
  return true
}
