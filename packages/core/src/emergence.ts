import type { EntityState, PlayerState, Point } from './types.ts'

function progress(tick: number, start: number) {
  return Math.floor(tick * 5 / 6) - Math.floor(start * 5 / 6)
}

// The authoritative body can already move. Remove its visual offset continuously
// when it leaves the opening, so input and remote snapshots stay at the same tick.
function offset(body: Point, origin: Point, remaining: number, extent: number) {
  const moved = Math.max(Math.abs(body.x - origin.x), Math.abs(body.y - origin.y))
  return remaining * Math.max(0, 1 - moved / extent)
}

export function playerPipePosition(p: PlayerState, tick: number): Point | null {
  const pipe = p.pipeExit
  if (!pipe || p.status !== 'alive') return null
  const frames = pipe.frames - progress(tick, pipe.tick)
  const horizontal = pipe.direction === 'left' || pipe.direction === 'right'
  const distance = offset(p, pipe, frames * (horizontal ? 0.5 : 1), horizontal ? p.width : p.height)
  if (distance < 0.5) return null
  const inward = pipe.direction === 'left' || pipe.direction === 'up' ? distance : -distance
  return { x: p.x + (horizontal ? inward : 0), y: p.y + (horizontal ? 0 : inward) }
}

export function blockItemPosition(e: EntityState, tick: number): (Point & { visible: boolean }) | null {
  if (e.blockReleaseTick === undefined) return null
  const frames = 62 - progress(tick, e.blockReleaseTick)
  const distance = offset(e, e.origin, frames / 4, 16)
  // CODE_01C48D emits no OAM until $1540 falls below $36.
  return distance > 0 ? { x: e.x, y: e.y + distance, visible: frames < 0x36 } : null
}
