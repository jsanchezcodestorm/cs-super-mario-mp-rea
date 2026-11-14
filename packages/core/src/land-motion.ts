import type { PlayerState } from './types.ts'
import { palFrame } from './pal-time.ts'

// E1 speed registers are signed 4.12 values. The PAL position routine uses
// the high byte in sixteenths of a pixel, scaling only Y by $128/$100.
const framesPerTick = 5 / 6
export const palVerticalSpeed = 0x128 / 0x100 * framesPerTick
const xUnit = framesPerTick / 4096
export const yUnit = palVerticalSpeed / 4096
const fullMeter = 104
const jumpSpeed = [-80, -82, -85, -87, -90, -92, -95, -97]
const spinSpeed = [-74, -76, -78, -80, -82, -85, -87, -90]

/** Signed high byte ($7B) of the PAL horizontal speed register. */
export function landSpeedByte(speed: number) {
  return Math.floor(Math.round(speed / xUnit) / 256)
}

export function launchSpeed(vx: number, spin: boolean) {
  const bucket = Math.min(7, Math.abs(landSpeedByte(vx)) >> 3)
  return (spin ? spinSpeed : jumpSpeed)[bucket] * palVerticalSpeed / 16
}

export function advanceLandY(speed: number, holding: boolean, floating: boolean) {
  const gravity = holding ? 0x0373 : 0x06e6
  const word = Math.round(speed / yUnit)
  if (floating && word >= 0x1000) return 0x1000 * yUnit
  return (Math.min(word, 0x4000) + gravity) * yUnit
}

// E1 writes $D0 to the high speed byte on a turn-block impact and then applies gravity.
export function spinReboundY(incoming: number, holding: boolean) {
  const fraction = Math.round(incoming / yUnit) & 0xff
  return advanceLandY((-0x3000 + fraction) * yUnit, holding, false)
}

export function landFrame(tick: number) {
  return palFrame(tick) !== palFrame(tick - 1)
}

export function advanceLandX(p: PlayerState, direction: number, running: boolean) {
  const word = Math.round(p.vx / xUnit)
  const high = Math.floor(word / 256)
  // Keep runTicks on the public 0..64 scale used by the renderer.
  const meter = Math.round(p.runTicks * fullMeter / 64)
  const charge = direction && running && Math.abs(high) >= 0x2c && (p.grounded || meter === fullMeter)
  const nextMeter = Math.min(fullMeter, Math.max(0, meter + (charge ? 3 : -1)))
  p.runTicks = nextMeter * 64 / fullMeter
  if (!direction && !p.grounded) return
  const limit = running ? (nextMeter === fullMeter ? 0x3c : 0x2d) : 0x19
  if (direction && (direction > 0 ? high < limit : high > -limit)) {
    const reverse = high !== 0 && Math.sign(high) !== direction
    const acceleration = reverse ? (running ? 0x640 : 0x320) : 0x1e0
    p.vx = (word + direction * acceleration) * xUnit
  } else {
    const drag = 0x140
    p.vx = Math.abs(word) <= drag ? 0 : (word - Math.sign(word) * drag) * xUnit
  }
}

// Sample the previous velocity for the native frame. Collision sweeps and
// sprite impulses elsewhere in the engine continue to use 60 Hz units.
export function landDistance(speed: number, vertical: boolean) {
  const unit = vertical ? yUnit : xUnit
  const high = Math.floor(Math.round(speed / unit) / 256)
  const dy = Math.trunc(Math.abs(high) * 0x128 / 16) / 256
  return vertical ? Math.sign(high) * dy : high / 16
}
