import { palFrame } from './pal-time.ts'
import { slopeHeight } from './slopes.ts'
import { isSolid, tileAt } from './terrain.ts'
import type { EntityState, LevelDefinition, PlayerState, World } from './types.ts'

export interface PipePlant {
  phase: number
  timer: number
  head: number
  leaves: number
  pose: number
  drawY: number
  hidden: boolean
}

export const isPipePlant = (id: number) => id === 0x1a || id === 0x2a || id === 0x4f || id === 0x50
export const isClassicPipePlant = (id: number) => id === 0x1a || id === 0x2a
const classicSpeeds = [0, -1, 0, 1]
const classicTimers = [32, 48, 32, 48]

/** InitPiranha and InitDownPiranha align the head with the middle of two Map16 tiles. */
export function initPipePlant(e: EntityState) {
  e.x = e.origin.x + 8
  e.y = e.origin.y - (e.spriteId === 0x2a ? 17 : 1)
  e.vx = e.vy = 0
  e.pipePlant = { phase: 0, timer: 0, head: 0, leaves: 0, pose: 0, drawY: e.y, hidden: false }
  return e.pipePlant
}

function classic(e: EntityState, p: PipePlant, nearby: boolean) {
  p.pose = (p.head >> 3) & 1
  p.head = (p.head + 1) & 255
  if (p.timer) {
    const speed = classicSpeeds[p.phase]
    e.vy = e.spriteId === 0x2a ? -speed : speed
    e.y += e.vy
    return
  }
  p.hidden = p.phase === 0 && nearby
  if (!p.hidden) {
    p.timer = classicTimers[p.phase]
    p.phase = (p.phase + 1) & 3
  }
}

// Object clipping $0C probes the floor at the top of the sprite. This also
// permits plants placed over ordinary ground to land below their spawn row.
function landed(world: World, room: LevelDefinition, e: EntityState) {
  const x = Math.floor(e.x) + 8
  const row = Math.floor(e.y / 16)
  const tile = tileAt(world, room, x >> 4, row)
  const slope = slopeHeight(world, room, tile, x & 15)
  if (slope === null && !isSolid(tile) && !(tile >= 0x100 && tile < 0x111)) return false
  const floor = row * 16 + (slope ?? 0)
  if (e.y < floor) return false
  e.y = floor + (e.y - Math.floor(e.y))
  return true
}

function jumping(world: World, room: LevelDefinition, e: EntityState, p: PipePlant, frame: number, nearby: boolean) {
  p.pose = ((p.head >> 3) & 1) * 2 + ((p.leaves >> 2) & 1)
  e.y += e.vy
  switch (p.phase) {
    case 0:
      e.vy = 0
      if (!p.timer && !nearby) { e.vy = -4; p.phase = 1 }
      return
    case 1:
      e.vy += 2 / 16
      p.head = (p.head + 1) & 255
      if (e.vy === -1) { p.timer = 80; p.phase = 2 }
      return
    case 2:
      p.leaves = (p.leaves + 1) & 255
      // At $40 the second fireball passes through the head update once more.
      if (p.timer && e.spriteId === 0x50) p.head = Number(p.timer === 64)
      p.head = (p.head + 1) & 255
      if (!(frame & 3) && e.vy < 0.5) e.vy += 1 / 16
      if (e.vy >= 0 && landed(world, room, e)) { p.timer = 64; p.phase = 0 }
  }
}

export function movePipePlant(world: World, room: LevelDefinition, e: EntityState, nearest: PlayerState) {
  const p = e.pipePlant ?? initPipePlant(e)
  const frame = palFrame(world.state.tick)
  if (frame === palFrame(world.state.tick - 1)) return
  // Both native routines draw before advancing their position.
  p.drawY = Math.floor(e.y)
  if (p.timer) p.timer--
  const nearby = Math.abs(Math.floor(nearest.x) - e.x) <= 27
  if (isClassicPipePlant(e.spriteId)) classic(e, p, nearby)
  else jumping(world, room, e, p, frame, nearby)
}

export function plantContactBox(e: EntityState) {
  return { x: e.x + 2, y: Math.floor(e.y) + 3, width: 12, height: isClassicPipePlant(e.spriteId) ? 21 : 10 }
}
