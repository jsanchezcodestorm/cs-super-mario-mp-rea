import type { GameState, LevelDefinition } from './types.ts'

/** Offset sequence of the E1 layer-three tide (05:C494). The first wait
 * underflows from zero, subsequent pauses begin with the timer at $4B. */
function captureCycle() {
  const heights: number[] = [], seen = new Map<string, number>()
  let offset = 112, fraction = 0, direction = 1, speed = 0, timer = 0
  for (let frame = 0; ; frame++) {
    const key = [frame & 3, offset, fraction, direction, speed, timer].join(',')
    const repeat = seen.get(key)
    if (repeat !== undefined) return { heights, repeat }
    seen.set(key, frame)
    heights.push(448 - offset)
    if ((frame & 3) === 0) {
      if (speed === 0 && (timer = (timer - 1) & 255) !== 0) continue
      const target = direction ? 4 : -4
      if (speed !== target) speed += direction ? 1 : -1
      timer = 75
    }
    if (offset === (direction ? 160 : 48)) direction ^= 1
    fraction += speed
    offset += Math.floor(fraction / 16)
    fraction = (fraction + 16) % 16
  }
}
const cycle = captureCycle()
export function tideSurface(room: LevelDefinition, state: GameState): number | null {
  if (!room.tide) return null
  if (room.tide === 2) return 384
  const frame = Math.floor((state.layerOffsets[room.id]?.age ?? 0) * 50 / 60)
  const index = frame < cycle.heights.length ? frame :
    cycle.repeat + (frame - cycle.repeat) % (cycle.heights.length - cycle.repeat)
  return cycle.heights[index]
}
