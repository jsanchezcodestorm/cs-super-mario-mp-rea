import type { LevelDefinition, PlayerState, World } from './types.ts'
import { clipDisplacement } from './terrain.ts'
import { die } from './resources.ts'

/** The reference PAL viewport is sampled every four video frames. */
export function scrollingCamera(room: LevelDefinition, clock: number) {
  const points = room.autoscroll
  if (!points?.length) return null
  const sample = Math.min((clock * 50) / (60 * 4), points.length - 1)
  const i = Math.floor(sample),
    blend = sample - i
  const [ax, ay] = points[i],
    [bx, by] = points[Math.min(points.length - 1, i + 1)]
  return { x: Math.round(ax + (bx - ax) * blend), y: Math.round(ay + (by - ay) * blend) }
}

export function startScrollAt(room: LevelDefinition, spawnX: number) {
  const samples = room.autoscroll
  if (!samples || spawnX < 256) return 0
  const target = spawnX - 96
  const i = samples.findIndex(([x]) => x >= target)
  return Math.round(((i < 0 ? samples.length - 1 : i) * 60 * 4) / 50)
}

export function constrainToScroll(world: World, room: LevelDefinition, p: PlayerState) {
  if (!room.autoscroll || p.roomId !== room.id || p.status !== 'alive') return
  p.scrollClock = (p.scrollClock ?? 0) + 1
  const camera = scrollingCamera(room, p.scrollClock)!
  if (p.y > camera.y + 224 + 16) {
    die(world, p)
    return
  }
  const target = Math.max(camera.x, Math.min(camera.x + 256 - p.width, p.x))
  if (target === p.x) return
  p.x = clipDisplacement(world, room, p, 'x', target - p.x)
  if (p.x < camera.x) die(world, p)
}
