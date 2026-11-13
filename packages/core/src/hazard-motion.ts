import { moveBooStream } from './boo-stream.ts'
import { nextSpriteRandom } from './sprite-random.ts'
import { palFrame } from './pal-time.ts'
import { moveBody, tileAt } from './terrain.ts'
import type { EntityState, LevelDefinition, PlayerState, World } from './types.ts'

const podobooLaunchSpeed = [
  0xf0, 0xdc, 0xd0, 0xc8, 0xc0, 0xb8, 0xb2, 0xac, 0xa6, 0xa0, 0x9a,
  0x96, 0x92, 0x8c, 0x88, 0x84, 0x80, 0x04, 0x08, 0x0c, 0x10, 0x14,
]

function advancesPalFrame(tick: number) {
  return palFrame(tick) !== palFrame(tick - 1)
}

function firstLiquidSurface(world: World, room: LevelDefinition, entity: EntityState) {
  const col = Math.floor(entity.origin.x / 16)
  for (let row = Math.max(0, Math.floor(entity.origin.y / 16)); row < room.height; row++) {
    const tile = tileAt(world, room, col, row)
    if (tile >= 0 && tile <= 5) return row * 16
  }
  throw new Error(`Fireball ${entity.id} in room ${room.id} has no liquid surface below its spawn`)
}

function initializePodoboo(world: World, room: LevelDefinition, entity: EntityState) {
  const surfaceY = firstLiquidSurface(world, room, entity)
  const distance = Math.floor((surfaceY - entity.origin.y) / 16)
  const profile = podobooLaunchSpeed[distance]
  if (profile === undefined)
    throw new Error(`Fireball ${entity.id} in room ${room.id} has unsupported launch depth ${distance}`)
  const launchSpeed = profile & 0x80 ? (profile > 0x7f ? profile - 0x100 : profile) / 16 : -8
  entity.width = 16
  entity.height = 16
  entity.x = entity.origin.x
  entity.y = surfaceY
  entity.vx = 0
  entity.vy = 0
  entity.hazardMotion = {
    type: 'podoboo',
    phase: 'waiting',
    surfaceY,
    timer: 32,
    launchSpeed,
    launchDelay: profile & 0x80 ? 0 : profile,
    launchHold: profile & 0x80 ? 0 : profile,
  }
}

/** Initialize native state once, when a level sprite enters the simulation. */
export function initializeHazard(world: World, room: LevelDefinition, entity: EntityState) {
  switch (entity.spriteId) {
    case 0x26:
      entity.x = entity.origin.x + 8
      entity.width = 24
      entity.height = 32
      entity.vx = 0
      entity.vy = 0
      entity.hazardMotion = { type: 'thwomp', phase: 'waiting', homeY: entity.y, timer: 0 }
      return true
    case 0x27:
      entity.width = 16
      entity.height = 16
      entity.vx = 0
      entity.vy = 0
      entity.hazardMotion = { type: 'thwimp', phase: 'falling', timer: 0, jumps: 0 }
      return true
    case 0x33:
      // This sprite ID is also used for player fireballs and Yoshi fire.
      if (entity.kind !== 'hazard') return false
      initializePodoboo(world, room, entity)
      return true
    case 0x9e: {
      entity.width = 16
      entity.height = 16
      entity.vx = 0
      entity.vy = 0
      entity.hazardMotion = {
        type: 'ball-and-chain',
        phase: 0,
        direction: entity.origin.x & 16 ? -1 : 1,
        ball: { x: entity.origin.x, y: entity.origin.y + 56 },
      }
      return true
    }
    case 0xac:
    case 0xad: {
      entity.width = 16
      entity.height = 80
      if (entity.spriteId === 0xac) entity.y -= 64
      entity.vx = 0
      entity.vy = 0
      entity.hazardMotion = {
        type: 'wooden-spike',
        phase: 0,
        timer: 0,
        direction: entity.spriteId === 0xad && (entity.origin.x & 16) ? -1 : 1,
      }
      return true
    }
    case 0xb2:
      entity.width = 16
      entity.height = 16
      entity.vx = 0
      entity.vy = 0
      entity.hazardMotion = { type: 'falling-spike', phase: 'idle', timer: 0, homeX: entity.x }
      return true
    case 0xb3:
      if (entity.kind !== 'hazard') return false
      entity.width = 16
      entity.height = 16
      entity.vx = 0
      entity.vy = 0
      entity.hazardMotion = { type: 'statue-fireball', direction: 0 }
      return true
    case 0xb6:
      entity.width = 16
      entity.height = 16
      entity.vx = 0
      entity.vy = 0
      entity.hazardMotion = {
        type: 'reflecting-fireball',
        direction: 1,
        horizontalSpeed: 1,
        verticalSpeed: -1,
      }
      return true
    default:
      return false
  }
}

function moveThwomp(world: World, room: LevelDefinition, entity: EntityState, target: PlayerState,
  motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'thwomp' }>) {
  switch (motion.phase) {
    case 'waiting': {
      const distance = Math.abs(target.x + target.width / 2 - (entity.x + entity.width / 2))
      if (distance < 44) motion.phase = 'falling'
      break
    }
    case 'falling': {
      if (moveBody(world, room, entity).some((contact) => contact.side === 'bottom')) {
        motion.phase = 'impact'
        motion.timer = 64
        entity.vy = 0
      } else entity.vy = Math.min(0x3e / 16, entity.vy + 4 / 16)
      break
    }
    case 'impact':
      if (--motion.timer <= 0) motion.phase = 'rising'
      break
    case 'rising':
      entity.y = Math.max(motion.homeY, entity.y - 1)
      if (entity.y === motion.homeY) motion.phase = 'waiting'
      break
  }
}

function restThwimp(entity: EntityState, motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'thwimp' }>) {
  entity.vx = 0
  entity.vy = 0
  entity.grounded = true
  motion.phase = 'resting'
  motion.timer = 64
}

function moveThwimp(world: World, room: LevelDefinition, entity: EntityState,
  motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'thwimp' }>) {
  if (motion.phase === 'resting') {
    if (--motion.timer <= 0) {
      motion.phase = 'jumping'
      motion.jumps++
      const direction = motion.jumps % 2 ? -1 : 1
      entity.facing = direction
      entity.vx = direction
      entity.vy = -6
      entity.grounded = false
    }
  } else {
    const contacts = moveBody(world, room, entity)
    if (contacts.some((contact) => contact.side === 'top')) entity.vy = 1
    else entity.vy = Math.min(4, entity.vy + (entity.vy < 0 ? 3 / 16 : 8 / 16))
    if (entity.grounded) restThwimp(entity, motion)
  }
}

function movePodoboo(world: World, entity: EntityState,
  motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'podoboo' }>) {
  if (motion.phase === 'waiting') {
    if (--motion.timer <= 0) {
      motion.phase = 'airborne'
      entity.y = motion.surfaceY
      entity.vy = motion.launchSpeed
    }
    return
  }
  entity.y += entity.vy
  if (entity.vy > 0 && entity.y >= motion.surfaceY) {
    entity.y = motion.surfaceY
    entity.vy = 0
    motion.phase = 'waiting'
    motion.timer = 96 + (nextSpriteRandom(world.state) & 0x3f)
    motion.launchHold = motion.launchDelay
  } else if (motion.launchHold > 0) motion.launchHold--
  else entity.vy = Math.min(7, entity.vy + 2 / 16)
}

function moveBallAndChain(world: World, entity: EntityState,
  motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'ball-and-chain' }>) {
  motion.phase = (motion.phase + motion.direction * 2 + 512) & 0x1ff
  const angle = motion.phase * Math.PI / 256
  const pivotX = entity.origin.x + 8
  const pivotY = entity.origin.y + 8
  motion.ball.x = pivotX + Math.round(56 * Math.sin(angle)) - entity.width / 2
  motion.ball.y = pivotY + Math.round(56 * Math.cos(angle)) - entity.height / 2
}

function moveWoodenSpike(entity: EntityState,
  motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'wooden-spike' }>) {
  switch (motion.phase) {
    case 0:
      if (motion.timer > 0) {
        entity.y += -motion.direction
        motion.timer--
      } else {
        motion.timer = 48
        motion.phase = 1
      }
      break
    case 1:
      if (motion.timer > 0) motion.timer--
      else {
        motion.timer = 24
        motion.phase = 2
      }
      break
    case 2:
      if (motion.timer > 0) {
        entity.y += 2 * motion.direction
        motion.timer--
      } else {
        motion.timer = 48
        motion.phase = 3
      }
      break
    case 3:
      if (motion.timer > 0) motion.timer--
      else {
        motion.timer = 47
        motion.phase = 0
      }
      break
  }
}

function moveFallingSpike(entity: EntityState, target: PlayerState,
  motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'falling-spike' }>) {
  if (motion.phase === 'idle' && Math.abs(target.x + target.width / 2 - (entity.x + 8)) < 64) {
    motion.phase = 'triggered'
    motion.timer = 32
  } else if (motion.phase === 'triggered') {
    if (--motion.timer <= 0) {
      motion.phase = 'armed'
      entity.x = motion.homeX
    } else {
      entity.x = motion.homeX + ((motion.timer >> 2) & 1)
    }
  }
}

function moveReflectingFireball(world: World, room: LevelDefinition, entity: EntityState, target: PlayerState,
  motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'reflecting-fireball' }>) {
  if (entity.age === 1) {
    motion.direction = target.x < entity.x ? -1 : 1
    motion.horizontalSpeed = motion.direction
    motion.verticalSpeed = -1
    entity.facing = motion.direction
  }
  const vx = motion.horizontalSpeed
  const vy = motion.verticalSpeed
  entity.vx = vx
  entity.vy = vy
  const contacts = moveBody(world, room, entity)
  if (contacts.some((contact) => contact.side === 'left' || contact.side === 'right') ||
      entity.x <= 0 || entity.x >= room.width * 16 - entity.width) {
    motion.horizontalSpeed = -vx
    motion.direction = motion.horizontalSpeed < 0 ? -1 : 1
    entity.facing = motion.direction
  }
  if (contacts.some((contact) => contact.side === 'top' || contact.side === 'bottom'))
    motion.verticalSpeed = -vy
  entity.vx = motion.horizontalSpeed
  entity.vy = motion.verticalSpeed
  entity.grounded = false
}

function moveStatueFireball(world: World, entity: EntityState, target: PlayerState,
  motion: Extract<NonNullable<EntityState['hazardMotion']>, { type: 'statue-fireball' }>) {
  if (motion.direction === 0) {
    motion.direction = target.x + target.width / 2 < entity.x + entity.width / 2 ? -1 : 1
    entity.facing = motion.direction
  }
  entity.x += motion.direction
}

/** Run only on source PAL sprite frames so velocity and timers keep cartridge rates. */
export function moveMovingHazard(world: World, room: LevelDefinition, entity: EntityState, target: PlayerState) {
  if (entity.kind === 'hazard' && entity.spriteId === 0xb0) {
    moveBooStream(world, room, entity, target)
    return true
  }
  if (!entity.hazardMotion) initializeHazard(world, room, entity)
  const motion = entity.hazardMotion
  if (!motion) return false
  if (!advancesPalFrame(world.state.tick)) return true
  switch (motion.type) {
    case 'thwomp': moveThwomp(world, room, entity, target, motion); return true
    case 'thwimp': moveThwimp(world, room, entity, motion); return true
    case 'podoboo': movePodoboo(world, entity, motion); return true
    case 'ball-and-chain': moveBallAndChain(world, entity, motion); return true
    case 'wooden-spike': moveWoodenSpike(entity, motion); return true
    case 'falling-spike': moveFallingSpike(entity, target, motion); return true
    case 'reflecting-fireball': moveReflectingFireball(world, room, entity, target, motion); return true
    case 'statue-fireball': moveStatueFireball(world, entity, target, motion); return true
  }
}
