import { advanceLandX, advanceLandY, landDistance, landFrame, launchSpeed } from './land-motion.ts'
import { duckPlayer } from './player-size.ts'
import { slopeMotion } from './slope-motion.ts'
import { limit } from './terrain.ts'
import { Buttons, type LevelDefinition, type PlayerState, type World } from './types.ts'

function approach(speed: number, target: number, accel: number) {
  return speed + limit(target - speed, -accel, accel)
}

interface MotionStep {
  jump?: boolean
  dx?: number
  dy?: number
}
export function advanceMotion(world: World, room: LevelDefinition, p: PlayerState, input: number, pressed: number, water: boolean): MotionStep {
  const direction = Number(!!(input & Buttons.right)) - Number(!!(input & Buttons.left))
  const running = !!(input & Buttons.run)
  const sample = landFrame(world.state.tick)
  const previousY = p.vy
  if (p.balloon > 0) {
    duckPlayer(world, p, false, false)
    p.balloon--
    p.vx = approach(p.vx, direction * 1.5, 0.085)
    const vertical = Number(!!(input & Buttons.down)) - Number(!!(input & Buttons.up))
    p.vy = approach(p.vy, vertical * 1.4 - 0.12, 0.07)
    p.grounded = false
    return {}
  }
  const onSlope = slopeMotion(world, room, p, input, pressed, water)
  const down = !!(input & Buttons.down)
  const swim = water && (!p.grounded || !!(pressed & (Buttons.jump | Buttons.spin)))
  let jump = pressed & (Buttons.jump | Buttons.spin)
  if (!water && !p.flight) {
    if (!sample && jump && p.grounded) p.queuedLandJump = jump
    jump = sample ? jump | (p.queuedLandJump ?? 0) : 0
  }
  if (sample || water || p.flight) delete p.queuedLandJump
  const spinJump = !p.mounted && !p.carrying && !!(jump & Buttons.spin)
  duckPlayer(world, p, down, !swim && !spinJump && !p.flight && !p.sliding)
  // Horizontal input brakes on flat ground during an intentional duck. A
  // player who released Down can still move out from under a low ceiling.
  const moving = p.ducking && p.grounded && down ? 0 : direction
  const launchX = p.vx
  if (!onSlope && water) {
    const accel = !moving ? 0.0625 : Math.sign(p.vx) === -moving ? 0.15 : 0.08
    p.vx = approach(p.vx, moving * 1.25, accel)
  } else if (!onSlope && sample) advanceLandX(p, moving, running)
  if (moving && !p.flight) p.facing = moving > 0 ? 1 : -1
  const takeoff = !!jump && (water || p.grounded)
  if (takeoff) {
    p.spin = spinJump && !water
    p.vy = water ? -2.8 - Math.abs(p.vx) * 0.42 : launchSpeed(launchX, p.spin)
    if (!water && p.form === 'cape' && p.runTicks === 64 && !p.spin) {
      p.vy = -8
      p.flight = 1
    }
    p.grounded = false
  }
  const holding = !!(input & (Buttons.jump | Buttons.spin))
  if (p.flight && running && !water && !p.spin) {
    if (p.vy > 0 && direction === -p.facing) p.vy = Math.max(-4, p.vy - 0.35)
    if (pressed & (p.facing === 1 ? Buttons.left : Buttons.right) && p.vy > 0.5) p.vy = -4.4
    p.vx = approach(p.vx, p.facing * 3, 0.14)
  }
  if (water) p.vy = Math.min(1.5, p.vy + 0.105)
  else if (p.flight) p.vy = Math.min(holding ? 1.3 : 4, p.vy + (holding && p.vy < 0 ? 0.1875 : 0.375))
  else if (sample) p.vy = advanceLandY(p.vy, holding, p.form === 'cape' && holding)
  if (water || p.flight) return { jump: takeoff }
  return {
    jump: takeoff,
    dx: onSlope ? undefined : sample ? landDistance(launchX, false) : 0,
    dy: sample ? landDistance(previousY, true) : 0,
  }
}
