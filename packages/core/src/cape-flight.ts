import { landFrame, yUnit } from './land-motion.ts'
import { Buttons, type CapeFlightState, type PlayerState } from './types.ts'

// E1 $D7D4, $D7C8, and $D7D9: requested phase, vertical cap, max stage.
const targetPhase = [1, 6, 3, 1, 0] as const
const phaseSpeedCap = [0, 0x1000, 0x3000, 0x3000, 0x3800, 0x3800, 0x4000] as const
const maxStageBySpeed = [0x00, 0x00, 0x00, 0xf8, 0xf8, 0xf8, 0xf4, 0xf0, 0xc8, 0x02, 0x01] as const
const pumpFrames = 8
const floatFrames = 16

export function startCapeFlight(): CapeFlightState {
  return { phase: 0, target: 2, pumpTimer: 0, floatTimer: 0, takeoffTimer: 0x50, maxStage: 0 }
}

export function clearCapeFlight(p: PlayerState) {
  p.flight = 0
  delete p.capeFlight
}

function requestedTarget(p: PlayerState, state: CapeFlightState, input: number): CapeFlightState['target'] {
  if (!(input & Buttons.run)) return 4
  if (p.vy < 0) return state.target
  const direction = Number(!!(input & Buttons.right)) - Number(!!(input & Buttons.left))
  if (direction) return direction === p.facing ? 1 : 0
  return state.phase < 4 ? 2 : state.target
}

function signedByte(value: number) { return value << 24 >> 24 }

function recordMaxStage(state: CapeFlightState, speed: number) {
  const word = Math.round(Math.max(0, speed) / yUnit)
  const highByte = Math.floor(word / 256)
  const stageIndex = Math.floor(highByte / 8)
  const stage = maxStageBySpeed[stageIndex]
  if (stage === undefined) throw new RangeError(`Cape speed stage ${stageIndex} is outside the E1 table.`)
  if (signedByte(stage) < signedByte(state.maxStage)) state.maxStage = stage
}

function pumpDuration(state: CapeFlightState) {
  return state.maxStage === 0xc8 ? 2 : pumpFrames
}

/** Advance cape controls once per PAL frame, keeping its phase in simulation state. */
export function stepCapeFlight(p: PlayerState, state: CapeFlightState, input: number, tick: number) {
  if (!landFrame(tick)) return

  if (state.pumpTimer > 0) state.pumpTimer--
  if (state.floatTimer > 0) state.floatTimer--
  if (state.takeoffTimer > 0) state.takeoffTimer--
  if ((input & Buttons.jump) && state.floatTimer === 0) state.floatTimer = floatFrames

  if (state.phase === 0) {
    if (p.vy < 0 || state.takeoffTimer === 0) return
    state.phase = 1
    state.target = 2
    state.maxStage = 0
    recordMaxStage(state, p.vy)
    state.pumpTimer = pumpDuration(state)
    return
  }
  if (state.phase >= 2) recordMaxStage(state, p.vy)

  const target = requestedTarget(p, state, input)
  const changedTarget = target !== state.target
  state.target = target
  if (!changedTarget && state.pumpTimer > 0) return

  const destination = targetPhase[target]
  if (state.phase === destination) return
  state.phase = (state.phase + Math.sign(destination - state.phase)) as CapeFlightState['phase']
  state.pumpTimer = pumpDuration(state)
}

/** Integrate E1 cape gravity and the vertical speed limit for the current pitch. */
export function advanceCapeFlightY(speed: number, state: CapeFlightState, holdingJump: boolean) {
  const word = Math.round(speed / yUnit)
  const downwardCap = state.phase > 0
    ? phaseSpeedCap[state.phase]
    : state.floatTimer > 0 ? 0x1000 : 0x4000
  const bounded = word < 0 ? word : Math.min(word, downwardCap)
  const gravity = holdingJump ? 0x0373 : 0x06e6
  return (bounded + gravity) * yUnit
}
