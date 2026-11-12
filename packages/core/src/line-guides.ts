import type { World, EntityState, LevelDefinition } from './types.ts'
import { tileAt } from './terrain.ts'

type Rail = NonNullable<EntityState['rail']>
function position(track: number[], rail: Rail) {
  const encoded = track[rail.step]
  return { x: rail.col * 16 + (encoded & 15), y: rail.row * 16 + (encoded >> 4) }
}
function findTrack(world: World, room: LevelDefinition, e: EntityState, x: number, y: number) {
  const guides = world.campaign.lineGuides
  if (!guides) throw new Error('Missing ROM line guide profiles')
  const col = Math.floor(x / 16),
    row = Math.floor(y / 16)
  let best: Rail | undefined,
    distance = e.rail ? 36 : 400
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const cx = col + dx,
        cy = row + dy,
        tile = tileAt(world, room, cx, cy)
      if (tile < 0x76 || tile > 0x95 || (e.rail?.col === cx && e.rail?.row === cy)) continue
      if ((tile === 0x94 && world.state.onOff) || (tile === 0x95 && !world.state.onOff)) continue
      const track = guides[tile - 0x76]
      for (const direction of [1, -1] as const) {
        const rail = { col: cx, row: cy, tile, direction, step: direction === 1 ? 0 : track.length - 1 }
        const p = position(track, rail)
        const squared = (p.x - x) ** 2 + (p.y - y) ** 2
        if (squared < distance) {
          best = rail
          distance = squared
        }
      }
    }
  return best
}
export function moveLineGuide(world: World, room: LevelDefinition, e: EntityState) {
  if ((e.spriteId === 0x63 || e.spriteId === 0x64) && !e.owner && e.rail) return
  // For platforms the attachment pin is at the midpoint of the top edge.
  const dx = e.kind === 'platform' && e.spriteId !== 0x64 ? -e.width / 2 : -8
  const dy = e.spriteId === 0x65 || e.spriteId === 0x66 ? -8 : 0
  const x = e.rail ? e.x - dx : e.origin.x,
    y = e.rail ? e.y - dy : e.origin.y
  let rail = e.rail
  if (rail) {
    const track = world.campaign.lineGuides![rail.tile - 0x76]
    rail.step += rail.direction
    if (rail.step < 0 || rail.step >= track.length) rail = findTrack(world, room, e, x, y)
  } else rail = findTrack(world, room, e, x, y)
  if (!rail) {
    if (e.rail) {
      e.vy = Math.min(4, e.vy + 0.15)
      e.x += e.vx
      e.y += e.vy
      const adjacent = findTrack(world, room, e, e.x - dx, e.y - dy)
      if (adjacent) e.rail = adjacent
    }
    return
  }
  const point = position(world.campaign.lineGuides![rail.tile - 0x76], rail)
  e.vx = point.x + dx - e.x
  e.vy = point.y + dy - e.y
  e.rail = rail
  e.x = point.x + dx
  e.y = point.y + dy
}
