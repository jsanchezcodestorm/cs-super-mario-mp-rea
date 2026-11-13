import { palFrame } from './pal-time.ts'
import { Buttons, type PlayerState } from './types.ts'

/** These counters advance in PAL frames and travel with the player's snapshot. */
export interface PlayerAnimation {
  step: number
  stepTimer: number
  stroke: number
  swimming: boolean
  climbing: boolean
  climbTimer: number
  climbRight: boolean
  cape: number
  capeTimer: number
  glide: number
  glideTimer: number
  takeoff: number
  yoshiStep: number
  yoshiTimer: number
  shotUntil: number
  spinUntil: number
  kick: number
  pickup: number
}

export function playerAnimation(p: PlayerState): PlayerAnimation {
  return p.animation ??= {
    step: 0, stepTimer: 0, stroke: 0, swimming: false, climbing: false, climbTimer: 0, climbRight: false,
    cape: 0, capeTimer: 0, glide: 0, glideTimer: 0, takeoff: 0, yoshiStep: 0, yoshiTimer: 0,
    shotUntil: 0, spinUntil: 0, kick: 0, pickup: 0,
  }
}

export function nativeSpeed(speed: number) { return Math.round(Math.abs(speed) * 16 * 6 / 5) }

// E1 $00:DC6C and $01:EDF5. Speeds are in sixteenths of a pixel per PAL frame.
const stepHold = [9, 8, 6, 5, 4, 3, 3, 2]
const yoshiHold = [3, 2, 1, 0]

function stepCape(p: PlayerState, a: PlayerAnimation, speed: number) {
  if (p.form !== 'cape') { a.cape = a.capeTimer = 0; return }
  if (a.capeTimer > 0 && --a.capeTimer) return
  let delay = 4
  if (!p.grounded && p.vy >= 0) a.cape = a.cape >= 10 ? 7 : Math.max(5, a.cape + 1)
  else if (p.grounded ? speed > 0 : p.runTicks === 64 || a.swimming) {
    a.cape = a.cape < 2 ? 5 : a.cape >= 6 ? 3 : a.cape + 1
    if (p.grounded) delay = stepHold[Math.min(7, speed >> 3)]
  } else {
    a.cape = Math.max(0, Math.min(2, a.cape - 1))
    if (p.grounded) delay = 8
  }
  a.capeTimer = a.swimming ? delay * 2 : delay
}

// FlightPhase moves a single step toward the requested pitch after each pump
// timer. In E1 the cape opens at the apex, after the charged takeoff.
function stepGlide(p: PlayerState, a: PlayerAnimation, input: number) {
  if (!p.flight || p.grounded || p.form !== 'cape') { a.glide = a.glideTimer = 0; return }
  if (!a.glide && p.vy < 0) return
  if (a.glideTimer && --a.glideTimer) return
  const forward = p.facing === 1 ? Buttons.right : Buttons.left
  const back = p.facing === 1 ? Buttons.left : Buttons.right
  const target = !(input & Buttons.run) ? 0 : p.vy < 0 ? 1 :
    input & forward ? 6 : input & back ? 1 : 3
  a.glide += Math.sign(target - a.glide)
  a.glideTimer = 8
}

export function stepPlayerAnimation(p: PlayerState, tick: number, input: number, pressed: number,
  water: boolean, climb: boolean) {
  const a = playerAnimation(p)
  const frame = palFrame(tick)
  a.swimming = water && !p.cloud
  const climbing = !!p.netClinging || (!p.mounted && !p.carrying && !p.cloud && !p.balloon && climb && !p.grounded &&
    !!(input & (Buttons.up | Buttons.down)) && !(pressed & (Buttons.jump | Buttons.spin)))
  if (climbing && !a.climbing) { a.climbRight = p.facing === 1; a.climbTimer = 0 }
  a.climbing = climbing
  if (p.netPunchTick !== undefined) a.climbRight = !(Math.floor(p.x - 2) & 8)
  if (p.netTurn && frame - palFrame(p.netTurn.tick) >= 24)
    a.climbRight = p.netTurn.fromBehind === (p.netTurn.offsetX < 0)
  if (!water) a.stroke = 0
  // Latch input edges even on the one server tick that has no new PAL frame.
  const stroke = water && (pressed & (Buttons.jump | Buttons.spin))
  if (frame === palFrame(tick - 1)) {
    if (stroke) a.stroke |= 16
    return
  }
  if (a.kick) a.kick--
  if (a.pickup) a.pickup--
  if (a.stroke) a.stroke--
  if (stroke) a.stroke |= 16
  if (a.climbing && !p.netTurn && (p.vx || p.vy) && a.climbTimer-- <= 0) {
    a.climbRight = !a.climbRight
    a.climbTimer = 7
  }
  const speed = nativeSpeed(p.wallRun ? p.vy : p.vx)
  if (a.takeoff) a.takeoff--
  if (p.grounded && speed >= 44 && input & Buttons.run) a.takeoff = 16
  if (a.stepTimer) a.stepTimer--
  if (!speed) a.step = 0
  else if (!a.stepTimer && (p.grounded || p.wallRun || a.takeoff)) {
    const phases = p.form === 'small' || p.growthPending ? 2 : 3
    a.step = (a.step + phases - 1) % phases
    a.stepTimer = stepHold[Math.min(7, speed >> 3)]
  }
  if (!p.mounted || !speed) a.yoshiTimer = 0
  else if (a.yoshiTimer-- <= 0) {
    a.yoshiStep = (a.yoshiStep + 1) % 3
    a.yoshiTimer = yoshiHold[Math.min(3, speed >> 4)]
  }
  stepCape(p, a, speed)
  stepGlide(p, a, input)
}
