import { playerViewport } from './autoscroll.ts'
import { nextSpriteRandom } from './sprite-random.ts'
import { advancesPalFrame } from './pal-time.ts'
import { emit } from './state.ts'
import type { EntityState, LevelDefinition, PlayerState, World } from './types.ts'

type Layer3SmashMotion = Extract<NonNullable<EntityState['hazardMotion']>, { type: 'layer3-smash' }>

export function initializeLayerThreeSmash(entity: EntityState) {
  entity.width = 16
  entity.height = 16
  entity.vx = 0
  entity.vy = 0
  entity.hazardMotion = {
    type: 'layer3-smash',
    phase: 'waiting',
    timer: 0,
    screenX: null,
    screenY: 0,
    speedY: 0,
  }
}

function startSmash(world: World, motion: Layer3SmashMotion, cameraX: number) {
  motion.phase = 'warning'
  motion.timer = 128
  motion.screenX = cameraX - 128 + (nextSpriteRandom(world.state) & 0x3f)
  motion.screenY = 0
  motion.speedY = 4
}

/** Run on PAL frames; keep the native Layer 3 scroll tied to the room position. */
export function moveLayerThreeSmash(world: World, room: LevelDefinition, entity: EntityState, target: PlayerState) {
  const motion = entity.hazardMotion
  if (!motion || motion.type !== 'layer3-smash') return false

  const camera = playerViewport(room, target)
  motion.screenX = camera.x + 0x78 - entity.x

  if (advancesPalFrame(world.state.tick)) {
    switch (motion.phase) {
      case 'waiting':
        if (motion.timer > 0) motion.timer--
        else startSmash(world, motion, camera.x)
        break
      case 'warning':
        motion.speedY = 4
        motion.screenY += motion.speedY / 16
        if (--motion.timer <= 0) motion.phase = 'falling'
        break
      case 'falling':
        motion.screenY += motion.speedY / 16
        motion.speedY = Math.min(0x40, motion.speedY + 7)
        if (motion.screenY >= 0xa0) {
          motion.screenY = Math.floor(motion.screenY / 16) * 16
          motion.phase = 'resting'
          motion.timer = 0x30
          emit(world, 'crush', target)
        }
        break
      case 'resting':
        if (--motion.timer <= 0) motion.phase = 'rising'
        break
      case 'rising':
        motion.speedY = -0x20
        motion.screenY = Math.max(0, motion.screenY + motion.speedY / 16)
        if (motion.screenY === 0) {
          motion.phase = 'waiting'
          motion.timer = 0xa0
        }
        break
    }
  }

  const screenX = motion.screenX
  if (screenX === null) throw new Error(`Layer 3 smash ${entity.id} has no screen position`)
  // Use the slab's visible center for simulation culling; screenX stores the ROM's scroll offset.
  entity.x = camera.x + 0x78 - screenX
  entity.y = camera.y + motion.screenY
  entity.vx = 0
  entity.vy = motion.speedY / 16
  return true
}

/** Apply the native 144 px contact span: 8 px side margins push; its center crushes. */
export function contactLayerThreeSmash(entity: EntityState, player: PlayerState, room: LevelDefinition) {
  const motion = entity.hazardMotion
  if (!motion || motion.type !== 'layer3-smash' || motion.screenX === null) return null

  const camera = playerViewport(room, player)
  const relativeX = player.x - camera.x + motion.screenX - 0x30
  if (relativeX < 0 || relativeX >= 0x90) return null

  const marioScreenY = player.y - camera.y
  const extraHeight = player.form !== 'small' && !player.ducking ? 16 : 0
  if (motion.screenY + extraHeight < marioScreenY) return null

  if (relativeX < 8) {
    player.vx = 8
    return 'handled' as const
  }
  if (relativeX >= 0x88) {
    player.vx = -8
    return 'handled' as const
  }
  if (player.grounded) return 'hurt' as const

  player.vy = motion.speedY < 0 ? 0 : motion.speedY / 16
  return 'handled' as const
}
