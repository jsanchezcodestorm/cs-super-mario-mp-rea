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
function slopeHeight(world: World, room: LevelDefinition, tile: number, localX: number) {
  if (tile < 0x16e || tile >= 0x1d8) return null
  const tables = world.campaign.slopes
  if (!tables) throw new Error('Missing ROM slope profiles')
  const shape = (room.tileset === 0 || room.tileset === 7 ? tables.steepShape : tables.shape)[tile - 0x16e]
  const height = tables.heights[shape * 16 + localX]
  return height >= 128 ? null : height
}
export interface Contact {
  layer2?: boolean
  col: number
  row: number
  tile: number
  side: 'top' | 'bottom' | 'left' | 'right'
}
function sweepTiles(world: World, room: LevelDefinition, body: Body, layer2 = false) {
  const readTile = layer2
    ? (_world: World, r: LevelDefinition, col: number, row: number) =>
        col >= 0 && row >= 0 && col < r.width && row < r.height ? r.layer2![row * r.width + col] : AIR
    : tileAt
  const contacts: Contact[] = []
  const wasGrounded = body.grounded
  const oldX = body.x
  body.x = layer2 ? body.x + body.vx : limit(body.x + body.vx, 0, Math.max(0, room.width * TILE - body.width))
  const dx = body.x - oldX
  for (const { col, row } of bodyCells(body)) {
    const tile = readTile(world, room, col, row)
    if (!isSolid(tile)) continue
    if (dx > 0 && oldX + body.width <= col * TILE + 0.01) {
      body.x = Math.min(body.x, col * TILE - body.width)
      contacts.push({ col, row, tile, side: 'right' })
    } else if (dx < 0 && oldX >= (col + 1) * TILE - 0.01) {
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
    for (const { col, row } of bodyCells(body)) {
      const tile = readTile(world, room, col, row)
      const ceiling = (row + 1) * TILE
      if ((!isSolid(tile) && !(tile >= 0x21 && tile < 0x25)) || oldY < ceiling - 0.01) continue
      body.y = Math.max(ceiling, body.y)
      body.vy = 0
      contacts.push({ col, row, tile, side: 'top' })
    }
  }
  body.x = Math.round(body.x * 256) / 256
  body.y = Math.round(body.y * 256) / 256
  return contacts
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
  if (moving.some((hit) => hit.side === 'bottom' || hit.side === 'top')) {
    body.y = local.y + oy
    body.vy = 0
  }
  body.grounded ||= local.grounded
  for (const hit of moving) {
    hit.layer2 = true
    contacts.push(hit)
  }
  return contacts
}
