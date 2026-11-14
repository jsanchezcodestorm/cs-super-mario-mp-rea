import { advancesPalFrame, palFrame } from './pal-time.ts'
import type { EntityState, LevelDefinition, PlayerState, World } from './types.ts'

export type FeatherSuperKoopaPhase = 'accelerating' | 'rising' | 'gliding'

export type SuperKoopaMotion =
  | { type: 'cape' }
  | { type: 'feather'; phase: FeatherSuperKoopaPhase; phaseFrames: number }

const maxFlightSpeed = 24 / 16
const flightAcceleration = 1 / 16
const ascentSpeed = -48 / 16
const ascentAcceleration = 2 / 16
const descentSpeed = 20 / 16
const descentDeceleration = 1 / 16
const capeFallSpeed = 40 / 16
const capeLiftSpeed = -17 / 16

export function isSuperKoopa(spriteId: number) {
  return spriteId >= 0x71 && spriteId <= 0x73
}

function initializeMotion(e: EntityState, player: PlayerState) {
  e.facing ??= player.x < e.x ? -1 : 1
  if (!e.superKoopa) {
    e.vx = 0
    e.vy = e.spriteId === 0x73 ? 0 : capeFallSpeed
    e.superKoopa = e.spriteId === 0x73
      ? { type: 'feather', phase: 'accelerating', phaseFrames: 0 }
      : { type: 'cape' }
  }
  return e.superKoopa
}

function moveFeatherSuperKoopa(
  e: EntityState,
  motion: Extract<SuperKoopaMotion, { type: 'feather' }>,
  direction: -1 | 1,
) {
  switch (motion.phase) {
    case 'accelerating': {
      const targetSpeed = direction * maxFlightSpeed
      if (e.vx !== targetSpeed) {
        e.vx += Math.sign(targetSpeed - e.vx) * flightAcceleration
        if (Math.abs(targetSpeed - e.vx) < flightAcceleration / 2) e.vx = targetSpeed
      }
      motion.phaseFrames++
      if (motion.phaseFrames === 48) {
        motion.phase = 'rising'
        motion.phaseFrames = 0
        e.vy = ascentSpeed
      }
      break
    }
    case 'rising':
      e.vy = Math.min(descentSpeed, e.vy + ascentAcceleration)
      if (e.vy >= descentSpeed) {
        motion.phase = 'gliding'
        motion.phaseFrames = 0
      }
      break
    case 'gliding':
      e.vx = direction * maxFlightSpeed
      e.vy = Math.max(0, e.vy - descentDeceleration)
      break
  }
}

function moveCapeSuperKoopa(frame: number, e: EntityState, direction: -1 | 1) {
  e.vx = direction * maxFlightSpeed
  if ((frame & 1) === 0 && e.vy > capeLiftSpeed) e.vy = Math.max(capeLiftSpeed, e.vy - descentDeceleration)
}

/** Reproduces E1 SuperKoopaMain's PAL-frame movement for sprite IDs $71–$73. */
export function moveSuperKoopa(world: World, _room: LevelDefinition, e: EntityState, player: PlayerState) {
  const motion = initializeMotion(e, player)
  const direction = e.facing
  if (direction === undefined) throw new Error('Super Koopa direction was not initialized')
  const tick = world.state.tick
  if (!advancesPalFrame(tick)) return

  // The cartridge integrates position first and updates speed/state afterward.
  e.x += e.vx
  e.y += e.vy
  if (motion.type === 'cape') moveCapeSuperKoopa(palFrame(tick), e, direction)
  else moveFeatherSuperKoopa(e, motion, direction)
}
