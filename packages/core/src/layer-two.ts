import type { World, LevelDefinition, LayerOffset, PlayerState } from './types.ts'

function initialLayer(): LayerOffset {
  return { x: 0, y: 0, dx: 0, dy: 0, age: 0, engaged: false }
}
function advance(layer: LayerOffset, target: number, speed: number) {
  layer.y += Math.sign(target - layer.y) * Math.min(speed, Math.abs(target - layer.y))
}
/** Scroll offsets are world-space. A room's moving layer advances while either player is present. */
export function stepLayer(world: World, room: LevelDefinition, players: PlayerState[]) {
  if (!room.layer2?.length || !players.length) return
  const layer = (world.state.layerOffsets[room.id] ??= initialLayer())
  const beforeX = layer.x,
    beforeY = layer.y
  const front = Math.max(...players.map((p) => (room.vertical ? p.y : p.x)))
  const control = room.sprites
    .filter((s) => s.spriteId >= 0xe8 && (room.vertical ? s.y : s.x) <= front + 160)
    .at(-1)
  if (!control) return
  layer.age++
  const variant = control.extra ?? 0
  switch (control.spriteId) {
    case 0xea: {
      // Vertical scroll, five variants.
      const amplitude = [114, 66, 2, 34, 16][variant]
      const sign = variant === 0 ? -1 : 1
      layer.y = (sign * amplitude * (1 - Math.cos(layer.age / Math.max(16, amplitude * 2)))) / 2
      break
    }
    case 0xef: {
      // Horizontal scroll in vertical rooms.
      const amplitude = variant === 0 ? 66 : 178
      layer.x = (-amplitude * (1 - Math.cos(layer.age / (amplitude * 2)))) / 2
      break
    }
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
      if (players.some((p) => p.layer2Ground)) layer.engaged = true
      if (layer.engaged) advance(layer, variant === 2 ? -176 : 192, variant === 2 ? 0.75 : 0.5)
      break
    }
  }
  layer.dx = layer.x - beforeX
  layer.dy = layer.y - beforeY
}
