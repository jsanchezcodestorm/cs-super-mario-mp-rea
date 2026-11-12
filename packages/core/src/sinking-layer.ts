import type { LayerOffset, PlayerState } from './types.ts'

/** E1 bank 05 ProcLayer2Sink. Camera ranges reset the layer between moving sections. */
const resetZones = [
  [[0, 0xd0], [0x2f0, 0x350], [0x8b0, 0xa30]],
  [[0, 8]],
  [[0, 0x40], [0x370, 0x380]],
]

export function stepSinkingLayer(layer: LayerOffset, variant: number, players: PlayerState[], cameraX: number) {
  const rises = variant === 2
  const initial = rises ? 192 : 0
  if (layer.age === 1) layer.y = initial
  layer.dx = 0
  layer.dy = 0
  if (resetZones[variant]?.some(([min, max]) => cameraX >= min && cameraX < max)) {
    layer.y = initial
    layer.engaged = false
    layer.scrollSpeed = 0
    return
  }
  if (players.some(p => p.layer2Ground)) layer.engaged = true
  if (!layer.engaged) return
  const palTick = 50 / 60
  const speed = Math.min(rises ? 0.75 : 0.5, (layer.scrollSpeed ?? 0) + (2 / 256) * palTick)
  layer.scrollSpeed = speed
  const previous = layer.y
  layer.y = rises ? Math.max(16, layer.y - speed * palTick) : Math.min(192, layer.y + speed * palTick)
  layer.dy = layer.y - previous
}
