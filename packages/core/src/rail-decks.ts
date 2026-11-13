import { palFrame } from './pal-time.ts'
import { tileAt } from './terrain.ts'
import type { EntityState, LevelDefinition, World } from './types.ts'

type Rail = NonNullable<EntityState['rail']>

// $01:D802 probes four points in this order. Nearby endpoints belonging to a
// parallel or crossing rail must not attract the motor.
const offsets = [[4, 4], [-4, 4], [4, -4], [-4, -4]]

function connect(world: World, room: LevelDefinition, e: EntityState, x: number, y: number, initial: boolean) {
  const profiles = world.campaign.lineGuides!, exits = world.campaign.lineGuideExits!
  for (const [dx, dy] of offsets) {
    const px = Math.floor(x + dx), py = Math.floor(y + dy)
    const col = px >> 4, row = py >> 4
    if (!initial && col === Math.floor(x / 16) && row === Math.floor(y / 16)) continue
    const tile = tileAt(world, room, col, row)
    if (tile < 0x76 || tile >= 0x9a || (tile === 0x94 && world.state.onOff) || (tile === 0x95 && !world.state.onOff)) continue
    // 96-99 are the four cosmetic line ends. The cartridge repeats the final
    // tile's profile at the current cell before leaving the guide.
    const repeat = tile >= 0x96
    const trackTile = repeat ? e.rail?.tile : tile
    if (trackTile === undefined) continue
    const index = trackTile - 0x76, shape = profiles[index]
    const axis = exits.axis[index]
    const coordinate = axis === 0 ? px : axis === 1 ? ~py : py
    const backwards = !initial && !e.railFlight && (coordinate & 15) >= 10
    const rail: Rail = {
      col: repeat ? Math.floor(x / 16) : col, row: repeat ? Math.floor(y / 16) : row,
      tile: trackTile, direction: backwards ? -1 : 1, step: backwards ? shape.length - 1 : 0,
    }
    if (!initial) {
      const sample = shape[rail.step]
      const ex = rail.col * 16 + (sample & 15), ey = rail.row * 16 + (sample >> 4)
      if (Math.abs(ex - (repeat ? x : px)) >= 8 || Math.abs(ey - (repeat ? y : py)) >= 8) continue
    }
    return rail
  }
}

function advanceRail(world: World, room: LevelDefinition, e: EntityState) {
  const profiles = world.campaign.lineGuides!, exits = world.campaign.lineGuideExits!
  const old = e.rail
  const pinX = e.x + e.width / 2, pinY = e.y + 8
  let rail = old
  if (e.railFlight) {
    const flight = e.railFlight
    e.x += flight.vx
    e.y += flight.vy
    flight.vy = Math.min(4, flight.vy + 3 / 16)
    if (--flight.hold > 0 || flight.vy < 2) return
    rail = connect(world, room, e, e.x + e.width / 2, e.y + 8, false)
    if (!rail) return
    delete e.railFlight
  } else if (!rail || rail.step < 0 || rail.step >= profiles[rail.tile - 0x76].length) {
    rail = connect(world, room, e, pinX, pinY, !rail)
    if (!rail) {
      const index = (old?.tile ?? 0x76) - 0x76 + (old?.direction === -1 ? 32 : 0)
      const sy = exits.y[index]
      e.railFlight = { vx: exits.x[index] / 8, vy: sy / (sy < 0 ? 4 : 8), hold: 16 }
      return
    }
  }
  const encoded = profiles[rail.tile - 0x76][rail.step]
  e.x = rail.col * 16 + (encoded & 15) - e.width / 2
  e.y = rail.row * 16 + (encoded >> 4) - 8
  rail.step += rail.direction
  e.rail = rail
}

export function moveRailDeck(world: World, room: LevelDefinition, e: EntityState) {
  const beforeX = e.x, beforeY = e.y
  const fresh = palFrame(e.age) !== palFrame(e.age - 1)
  if ((!e.rail || e.spriteId === 0x62 || e.owner) && (fresh || !e.rail)) advanceRail(world, room, e)
  e.vx = e.x - beforeX
  e.vy = e.y - beforeY
  if (e.y > room.height * 16 + 96) e.active = false
}
