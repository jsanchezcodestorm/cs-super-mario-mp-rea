import { stepSinkingLayer } from './sinking-layer.ts'
import { palFrame } from './pal-time.ts'
import type { World, LevelDefinition, LayerOffset, PlayerState } from './types.ts'

function initialLayer(): LayerOffset {
  return { x: 0, y: 0, dx: 0, dy: 0, age: 0, engaged: false }
}
function advance(layer: LayerOffset, target: number, speed: number) {
  layer.y += Math.sign(target - layer.y) * Math.min(speed, Math.abs(target - layer.y))
}
/** Scroll offsets are world-space. A room's moving layer advances while either player is present. */
export function stepLayer(world: World, room: LevelDefinition, players: PlayerState[]) {
  if (!players.length) return
  if (room.tide) {
    const tide = (world.state.layerOffsets[room.id] ??= initialLayer())
    tide.age++
    return
  }
  if (!room.layer2?.length) return
  const layer = (world.state.layerOffsets[room.id] ??= initialLayer())
  if (room.layerScrollPath) {
    const clock = Math.max(...players.map(p => p.scrollClock ?? 0))
    const path = room.layerScrollPath
    const [x, y] = path[Math.min(palFrame(clock), path.length - 1)]
    // Re-entry or a respawn can seek the camera. Only consecutive samples
    // physically carry a rider; seeking loads the terrain at its new offset.
    layer.dx = clock === layer.age ? x - layer.x : 0
    layer.dy = clock === layer.age ? y - layer.y : 0
    layer.x = x
    layer.y = y
    layer.age = clock + 1
    return
  }
  if (room.layerOscillation && layer.age === 0) layer[room.layerOscillation.axis] = room.layerOscillation.samples[0]
  const beforeX = layer.x,
    beforeY = layer.y
  const motion = room.layerOscillation
  if (motion) {
    const frame = Math.floor(layer.age++ * 50 / 60)
    const length = motion.samples.length
    const index = frame < length ? frame : motion.start + (frame - motion.start) % (length - motion.start)
    layer[motion.axis] = motion.samples[index]
    layer.dx = layer.x - beforeX
    layer.dy = layer.y - beforeY
    return
  }
  const front = Math.max(...players.map((p) => (room.vertical ? p.y : p.x)))
  const control = room.sprites
    .filter((s) => s.spriteId >= 0xe8 && (
      (room.vertical ? s.y : s.x) <= front + 160 || (s.spriteId === 0xf5 && layer.age > 0)
    ))
    .at(-1)
  if (!control) return
  layer.age++
  const variant = control.extra ?? 0
  switch (control.spriteId) {
    case 0xe9: {
      // The crusher drops rapidly, pauses and retreats more slowly.
      const period = variant === 2 ? 182 : 220,
        clock = layer.age % period
      if (clock < 60) advance(layer, 0, 1)
      else if (clock < 100) advance(layer, variant === 0 ? 96 : 128, 8)
      else if (clock > 125) advance(layer, 0, 1.5)
      break
    }
    case 0xf2:
      advance(layer, world.state.onOff ? -1 : 160, 0.25)
      if (layer.y === -1) world.state.onOff = false
      break
    case 0xf5: {
      const cameraX = Math.max(0, Math.min(room.width * 16 - 256, front - 128))
      stepSinkingLayer(layer, variant, players, cameraX)
      return
    }
  }
  layer.dx = layer.x - beforeX
  layer.dy = layer.y - beforeY
}
