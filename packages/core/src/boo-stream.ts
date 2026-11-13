import { palFrame } from './pal-time.ts'
import { moveBody } from './terrain.ts'
import type { EntityState, LevelDefinition, PlayerState, Point, World } from './types.ts'

export interface BooStream {
  slot: number
  trail: (Point & { slot: number; right: boolean; until: number })[]
}

// E1 $03:8F7A. The moving ghost leaves a stationary minor-extended sprite
// every eight PAL frames. All streams in a room share twelve trail slots.
export function moveBooStream(world: World, room: LevelDefinition, e: EntityState, target: PlayerState) {
  const frame = palFrame(world.state.tick)
  if (!e.booStream) {
    const used = new Set(world.state.entities.filter(other => other.roomId === room.id && other.booStream)
      .map(other => other.booStream!.slot))
    let slot = 11
    while (slot > 0 && used.has(slot)) slot--
    e.booStream = { slot, trail: [] }
    e.facing = target.x < e.x ? -1 : 1
    e.vx = e.facing
    e.vy = -1
  }
  if (frame === palFrame(world.state.tick - 1)) return
  const stream = e.booStream
  stream.trail = stream.trail.filter(part => part.until > frame)
  if (!((frame ^ stream.slot) & 7)) {
    const trails = world.state.entities.filter(other => other.roomId === room.id && other.booStream)
      .flatMap(other => other.booStream!.trail).filter(part => part.until > frame)
    const occupied = new Set(trails.map(part => part.slot))
    let slot = 11
    while (slot >= 0 && occupied.has(slot)) slot--
    if (slot < 0) {
      const oldest = trails.reduce((a,b) => a.until < b.until ? a : b)
      slot = oldest.slot
      oldest.until = frame
    }
    stream.trail.push({ slot, x: e.x, y: e.y, right: e.vx > 0, until: frame + 48 })
  }
  const dx = e.vx, dy = e.vy
  const hits = moveBody(world, room, e)
  e.vx = hits.some(hit => hit.side === 'left' || hit.side === 'right') ? -dx : dx
  e.vy = hits.some(hit => hit.side === 'top' || hit.side === 'bottom') ? -dy : dy
  e.facing = e.vx < 0 ? -1 : 1
}
