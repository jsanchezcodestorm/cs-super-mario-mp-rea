import { Buttons, type PlayerState } from './types.ts'

export function yoshiLunging(p: PlayerState, input = p.lastInput) {
  return p.tongueFrame >= 10 && p.grounded && !(input & Buttons.up)
}

/** Upper-left pixel of the first 8×8 tongue tile in the PAL OAM. */
export function yoshiTongueBase(p: PlayerState, input = p.lastInput) {
  const lunge = yoshiLunging(p, input)
  return {
    x: Math.floor(p.x + p.width / 2) + p.facing * (lunge ? 22 : 17) - 4,
    y: Math.floor(p.y + p.height) - (lunge ? 13 : 24),
  }
}

export function yoshiTongueTip(p: PlayerState, input = p.lastInput) {
  const base = yoshiTongueBase(p, input)
  return { x: base.x + p.facing * p.tongue, y: base.y + 2, width: 8, height: 4 }
}
