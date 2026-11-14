import { stepNetPunch } from './net-door.ts'
import { palFrame } from './pal-time.ts'
import { climbStepY, jumpFromClimb } from './climb-motion.ts'
import { climbContacts } from './climb-contacts.ts'
import { clearCapeFlight } from './cape-flight.ts'
import { Buttons, type LevelDefinition, type PlayerState, type World } from './types.ts'

export function stepTileClimb(world: World, room: LevelDefinition, p: PlayerState,
  nearClimbable: boolean, input: number, pressed: number, water: boolean) {
  if (!nearClimbable && !p.netClinging && !p.vineClinging && !p.behindNet) return false
  const grip = climbContacts(world, room, p)
  if (!grip.touching && !p.netTurn) delete p.behindNet
  if ((!grip.touching || p.mounted || p.carrying || p.cloud || p.balloon) && !p.netTurn) {
    delete p.netClinging
    delete p.vineClinging
    delete p.netPunchTick
    return false
  }
  const up = !!(input & Buttons.up), down = !!(input & Buttons.down)
  const grab = up || (down && (!p.grounded || grip.foot))
  if (!p.netClinging && !p.vineClinging && !(grab && grip.canGrab)) return false
  if (!p.netTurn) {
    p.netClinging = grip.net || undefined
    p.vineClinging = !grip.net || undefined
  }
  p.spin = p.grounded = false
  clearCapeFlight(p)
  p.vx = p.vy = 0
  if (p.netClinging && stepNetPunch(world.state, room, p, pressed)) return true
  if (pressed & Buttons.jump) {
    delete p.netClinging
    delete p.vineClinging
    jumpFromClimb(world, p, water)
    return true
  }
  const direction = Number(!!(input & Buttons.right)) - Number(!!(input & Buttons.left))
  if ((!up && down && !grip.center) || (direction && !grip.net && !grip.bothHands)) {
    delete p.netClinging
    delete p.vineClinging
    return true
  }
  if (palFrame(world.state.tick) === palFrame(world.state.tick - 1)) return true
  const step = water ? 0.5 : 1
  if (grip.bothHands || (direction < 0) !== grip.leftSide) p.vx = direction * step
  if (up ? grip.head : down) {
    p.vy = (up ? -1 : 1) * step * climbStepY
    if (!grip.net) p.vx = 0
  }
  return true
}
