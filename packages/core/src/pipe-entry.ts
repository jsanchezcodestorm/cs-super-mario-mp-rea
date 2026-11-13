import type { Body, LevelDefinition, Point } from './types.ts'

function horizontalMouth(room: LevelDefinition, col: number, top: number, body: Pick<Body, 'width' | 'height'>) {
  const lip = top * room.width + col
  const bottom = room.tiles[lip + room.width]
  if (room.tiles[lip] !== 0x13b || (bottom !== 0x13c && bottom !== 0x13f)) return null
  for (const direction of [1, -1]) {
    const stem = col - direction
    if (stem < 0 || stem >= room.width) continue
    const index = top * room.width + stem
    if (room.tiles[index] === 0x13d && room.tiles[index + room.width] === 0x13e)
      return { x: direction === 1 ? (col + 1) * 16 : col * 16 - body.width, y: (top + 2) * 16 - body.height }
  }
  return null
}

export function pipeEndpoint(room: LevelDefinition, point: Point, body: Pick<Body, 'width' | 'height'>): Point | null {
  const col = Math.floor(point.x / 16)
  const row = Math.floor(point.y / 16)
  const tile = room.tiles[row * room.width + col]
  if (tile === 0x13b || tile === 0x13c || tile === 0x13f)
    return horizontalMouth(room, col, tile === 0x13b ? row : row - 1, body)
  if (tile !== 0x135 && tile !== 0x136 && tile !== 0x133 && tile !== 0x134) return null
  const left = tile === 0x135 || tile === 0x133 ? col : col - 1
  for (let y = row; y < room.height; y++) {
    const index = y * room.width + left
    if (room.tiles[index] === 0x133 && room.tiles[index + 1] === 0x134) {
      const below = index + room.width
      const upward = room.tiles[below] === 0x135 && room.tiles[below + 1] === 0x136
      return { x: left * 16 + 8, y: upward ? y * 16 - body.height : (y + 1) * 16 }
    }
    if (room.tiles[index] !== 0x135 || room.tiles[index + 1] !== 0x136) break
  }
  return null
}

/** Place the collision box at the endpoint of the cartridge's scripted pipe exit. */
export function pipeEntry(room: LevelDefinition, point: Point, body: Pick<Body, 'width' | 'height'>): Point {
  return pipeEndpoint(room, point, body) ?? point
}
