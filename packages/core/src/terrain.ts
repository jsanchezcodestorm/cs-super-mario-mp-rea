import { slopeHeight, slopeProfile, slopeSample } from './slopes.ts'
import { alignToPassage } from './narrow-passage.ts'
import type { Body, LevelDefinition, World, GameState } from './types.ts'

export const TILE = 16
export const AIR = 0x25
export const USED = 0x132
export const limit = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
export function tileAt(world: World, room: LevelDefinition, col: number, row: number) {
  if (col < 0 || row < 0 || col >= room.width || row >= room.height) return AIR
  const index = row * room.width + col
  return effectiveTile(world.state, room, index)
}
export function effectiveTile(state: GameState, room: LevelDefinition, index: number) {
  const tile = state.tileChanges[room.id]?.[index] ?? room.tiles[index]
  if (state.silverSwitch > 0 && tile === 0x12f) return 0x2b
  if (state.pSwitch > 0) {
    if (tile === 0x2b) return USED
    if (tile === 0x2a || tile === USED) return 0x2b
    if (tile === 0x29) return 0x24
  }
  // Palace switch outlines become their corresponding solid blocks globally.
  if (tile >= 0x6a && tile <= 0x6d) {
    const palace = ['008', '014', '121', '11b'][tile - 0x6a]
    if (state.progress.completed.includes(palace + ':normal')) return 0x16a + (tile - 0x6a)
  }
  return tile
}
export function changeTile(world: World, room: LevelDefinition, col: number, row: number, tile: number) {
  const changes = (world.state.tileChanges[room.id] ??= {})
  changes[row * room.width + col] = tile
}
export function bodyCells(body: Body) {
  const cells: { col: number; row: number }[] = []
  for (let row = Math.floor(body.y / TILE); row <= Math.floor((body.y + body.height - 0.01) / TILE); row++)
    for (let col = Math.floor(body.x / TILE); col <= Math.floor((body.x + body.width - 0.01) / TILE); col++)
      cells.push({ col, row })
  return cells
}
export function isSolid(tile: number) {
  return (tile >= 0x111 && tile < 0x16e) || (tile >= 0xec && tile <= 0xfb)
}
function blocksBody(tile: number) {
  return isSolid(tile) || (tile >= 0x21 && tile < 0x25)
}
function overlapsBlockedTiles(world: World, room: LevelDefinition, body: Body, layer2 = false) {
  const readTile = layer2
    ? (_world: World, r: LevelDefinition, col: number, row: number) =>
        col >= 0 && row >= 0 && col < r.width && row < r.height ? r.layer2![row * r.width + col] : AIR
    : tileAt
  return bodyCells(body).some(({ col, row }) => blocksBody(readTile(world, room, col, row)))
}
/** Check whether a body can occupy a position in either terrain layer. */
export function isBodyFree(world: World, room: LevelDefinition, body: Body) {
  if (overlapsBlockedTiles(world, room, body)) return false
  if (room.layer2?.length) {
    const offset = world.state.layerOffsets[room.id]
    const local = { ...body, x: body.x - (offset?.x ?? 0), y: body.y - (offset?.y ?? 0) }
    if (overlapsBlockedTiles(world, room, local, true)) return false
  }
  return true
}
export function isDanger(tile: number, tileset: number | undefined) {
  return (
    tile === 0x5 ||
    tile >= 0x1fb ||
    tile === 0x12f ||
    (tile >= 0x166 && tile < 0x16a) ||
    ((tileset === 3 || tileset === 14) && tile >= 0x1d2 && tile <= 0x1d7) ||
    ((tileset === 5 || tileset === 13) && tile >= 0x159 && tile <= 0x15b)
  )
}
export interface Contact {
  layer2?: boolean
  crushed?: boolean
  col: number
  row: number
  tile: number
  side: 'top' | 'bottom' | 'left' | 'right'
}
function sweepTiles(world: World, room: LevelDefinition, body: Body, layer2 = false, external = false) {
  const readTile = layer2
    ? (_world: World, r: LevelDefinition, col: number, row: number) =>
        col >= 0 && row >= 0 && col < r.width && row < r.height ? r.layer2![row * r.width + col] : AIR
    : tileAt
  const contacts: Contact[] = []
  const wasGrounded = body.grounded
  const oldX = body.x
  body.x = layer2 ? body.x + body.vx : limit(body.x + body.vx, 0, Math.max(0, room.width * TILE - body.width))
  if (!layer2 && !external) alignToPassage(body, oldX, (col, row) => isSolid(readTile(world, room, col, row)))
  const dx = body.x - oldX
  // A foot samples one pixel in from either edge. If the foot just missed a
  // corner on the preceding frame, the next inward step still meets its wall.
  const sideSkin = 'form' in body ? 1 : 0.01
  for (const { col, row } of bodyCells(body)) {
    const tile = readTile(world, room, col, row)
    if (!isSolid(tile)) continue
    if (dx > 0 && oldX + body.width <= col * TILE + sideSkin) {
      body.x = Math.min(body.x, col * TILE - body.width)
      contacts.push({ col, row, tile, side: 'right' })
    } else if (dx < 0 && oldX >= (col + 1) * TILE - sideSkin) {
      body.x = Math.max(body.x, (col + 1) * TILE)
      contacts.push({ col, row, tile, side: 'left' })
    }
  }
  if (contacts.length) body.vx = 0
  const oldY = body.y,
    oldBottom = oldY + body.height
  body.y += body.vy
  body.grounded = false
  if (body.vy >= 0) {
    const newBottom = body.y + body.height
    let surface = Infinity
    const xs = [body.x + 1, body.x + body.width / 2, body.x + body.width - 1]
    for (const x of xs) {
      const col = Math.floor(x / TILE)
      for (
        let row = Math.floor((oldBottom - 5) / TILE);
        row <= Math.floor((newBottom + (wasGrounded ? 5 : 0)) / TILE);
        row++
      ) {
        const tile = readTile(world, room, col, row)
        const slope = slopeHeight(world, room, tile, Math.floor(x) % TILE)
        if (slope === null && !isSolid(tile) && (tile < 0x100 || tile >= 0x111)) continue
        const floor = row * TILE + (slope ?? 0)
        const stick = slope !== null && wasGrounded ? 5 : 0.01
        if (oldBottom > floor + stick || newBottom + stick < floor || floor >= surface) continue
        surface = floor
        contacts.push({ col, row, tile, side: 'bottom' })
      }
    }
    if (surface !== Infinity) {
      body.y = surface - body.height
      body.vy = 0
      body.grounded = true
    }
  } else {
    const headX = body.x + body.width / 2, headCol = Math.floor(headX / TILE)
    for (const { col, row } of bodyCells(body)) {
      const tile = readTile(world, room, col, row)
      let ceiling = (row + 1) * TILE
      if (!blocksBody(tile)) {
        if (col !== headCol || !('form' in body)) continue
        const profile = slopeProfile(world, room, tile)
        if (profile === null) continue
        const depth = -slopeSample(world, profile, headX)
        if (depth <= 0) continue
        ceiling = row * TILE + depth
      }
      if (oldY < ceiling - 0.01 || body.y > ceiling) continue
      body.y = Math.max(ceiling, body.y)
      body.vy = 0
      contacts.push({ col, row, tile, side: 'top' })
    }
  }
  if (!external) {
    body.x = Math.round(body.x * 256) / 256
    body.y = Math.round(body.y * 256) / 256
  }
  return contacts
}

/** Sweep an external displacement against both layers at their current offsets. */
export function clipDisplacement(
  world: World, room: LevelDefinition, body: Body, axis: 'x' | 'y', distance: number,
) {
  if (!distance) return body[axis]
  const probe = { ...body, grounded: false, vx: axis === 'x' ? distance : 0, vy: axis === 'y' ? distance : 0 }
  sweepTiles(world, room, probe, false, true)
  if (!room.layer2?.length) return probe[axis]
  const offset = world.state.layerOffsets[room.id]
  const local = {
    ...probe,
    x: body.x - (offset?.x ?? 0),
    y: body.y - (offset?.y ?? 0),
    vx: axis === 'x' ? probe.x - body.x : 0,
    vy: axis === 'y' ? probe.y - body.y : 0,
  }
  sweepTiles(world, room, local, true, true)
  return local[axis] + (offset?.[axis] ?? 0)
}

/** Sweep both coordinate systems. Layer two can translate independently of level terrain. */
export function moveBody(world: World, room: LevelDefinition, body: Body) {
  if (!room.layer2?.length) return sweepTiles(world, room, body)
  const offset = world.state.layerOffsets[room.id]
  const dx = offset?.dx ?? 0,
    dy = offset?.dy ?? 0
  const ox = offset?.x ?? 0,
    oy = offset?.y ?? 0
  const { x, y, grounded } = body,
    riding = body.layer2Ground === true && body.vy >= 0
  if (riding) {
    body.vx += dx
    body.vy += dy
  }
  const contacts = sweepTiles(world, room, body)
  if (riding) {
    body.vx -= dx
    if (!body.grounded) body.vy -= dy
  }
  const local = {
    ...body,
    x: x - ox + dx,
    y: y - oy + dy,
    vx: body.x - x - dx,
    vy: body.y - y - dy,
    grounded: riding && grounded,
  }
  const moving = sweepTiles(world, room, local, true)
  body.layer2Ground = local.grounded
  if (moving.some((hit) => hit.side === 'left' || hit.side === 'right')) {
    body.x = local.x + ox
    body.vx = 0
  }
  const verticalHit = moving.find((hit) => hit.side === 'bottom' || hit.side === 'top')
  if (verticalHit) {
    const targetY = local.y + oy
    const travel = targetY - body.y
    if (dy && travel * dy > 0 && 'form' in body) {
      // Layer 2 may be lifting a rider against a solid ceiling, or pressing
      // down against a floor. Its correction cannot overrule the static layer.
      const probe = { ...body, grounded: false, vx: 0, vy: travel }
      const stopped = sweepTiles(world, room, probe).some((hit) =>
        hit.side === (travel < 0 ? 'top' : 'bottom'))
      body.y = stopped ? probe.y : targetY
      verticalHit.crushed = stopped && Math.abs(probe.y - targetY) > 1 / 256
    } else body.y = targetY
    body.vy = 0
  }
  body.grounded ||= local.grounded
  for (const hit of moving) {
    hit.layer2 = true
    contacts.push(hit)
  }
  return contacts
}
