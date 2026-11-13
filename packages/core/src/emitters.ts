import { playerViewport } from './autoscroll.ts'
import { moveBody } from './terrain.ts'
import { spawnEntity } from './state.ts'
import type { EntityState, World, LevelDefinition, PlayerState, Point } from './types.ts'

type Emission = [
  tick: number,
  sprite: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  c2: number,
  facing: number,
]
export type EmitterCatalog = Record<number, { period: number; events: Emission[] }>

const bulletX = [2, -2, 0, 0, 1.5, 1.5, -1.5, -1.5]
const bulletY = [0, 0, -2, 2, -1.5, 1.5, 1.5, -1.5]

function createEmission(world: World, room: LevelDefinition, row: Emission, view: Point) {
  const [, sprite, x, y, speedX, speedY, c2, facing] = row
  const kind = sprite === 0x9d ? 'flyer' : sprite === 0xb3 ? 'bullet' : undefined
  const e = spawnEntity(world, room.id, { x: view.x + x, y: view.y + y, spriteId: sprite }, kind)
  if (!e) return
  e.emission = { c2, facing }
  e.vx = speedX
  e.vy = speedY
  if (sprite === 0x1c) {
    e.vx = bulletX[c2]
    e.vy = bulletY[c2]
  }
}

function fireCannons(world: World, room: LevelDefinition, players: PlayerState[]) {
  for (const cannon of room.sprites) {
    if (cannon.spriteId !== 0xc9 && cannon.spriteId !== 0xca) continue
    const torpedo = cannon.spriteId === 0xca
    if (world.state.tick % (torpedo ? 160 : 192) !== 0) continue
    const target = players
      .filter((p) => {
        const v = playerViewport(room, p)
        return cannon.x >= v.x + 16 && cannon.x < v.x + 240 && cannon.y >= v.y && cannon.y < v.y + 224
      })
      .sort((a, b) => Math.abs(a.x - cannon.x) - Math.abs(b.x - cannon.x))[0]
    if (!target || (!torpedo && Math.abs(target.x - cannon.x) < 17)) continue
    const dir = target.x < cannon.x ? 1 : 0
    createEmission(
      world,
      room,
      [0, torpedo ? 0x44 : 0x1c, cannon.x, cannon.y - 1, torpedo ? 0.25 : 0, 0, dir, dir],
      { x: 0, y: 0 },
    )
  }
}

export function stepEmitters(world: World, room: LevelDefinition, players: PlayerState[]) {
  fireCannons(world, room, players)
  const views: Point[] = []
  for (const p of players) {
    const v = playerViewport(room, p)
    if (views.some((used) => Math.abs(used.x - v.x) < 256 && Math.abs(used.y - v.y) < 224)) continue
    views.push(v)
    const end = room.vertical ? v.y + 224 : v.x + 256
    let active = 0,
      position = -1
    for (const sprite of room.sprites) {
      const along = room.vertical ? sprite.y : sprite.x
      if (sprite.spriteId < 0xcb || sprite.spriteId > 0xd9 || along > end || along < position) continue
      active = sprite.spriteId
      position = along
    }
    const sequence = world.campaign.emitters?.[active]
    if (!sequence) continue
    const count = world.state.entities.filter(
      (e) => e.active && e.emission && e.roomId === room.id && Math.abs(e.x - v.x - 128) < 288,
    ).length
    if (count >= 12) continue
    const frame = world.state.tick % sequence.period
    for (const row of sequence.events) {
      if (row[0] > frame) break
      if (row[0] === frame) createEmission(world, room, row, v)
    }
  }
}

/** Initial conditions come from the original generator. After emission, these
 * actors move through the same shared world as level-placed actors. */
export function moveEmission(world: World, room: LevelDefinition, e: EntityState) {
  if (!e.emission) return false
  const { c2, facing } = e.emission,
    dir = facing ? -1 : 1
  switch (e.spriteId) {
    case 0x1c:
      e.x += e.vx
      e.y += e.vy
      break
    case 0x44:
      if (e.age < 32) e.y += 0.5
      else {
        e.vx = dir * Math.min(2.25, Math.abs(e.vx) + 0.05)
        e.x += e.vx
      }
      break
    case 0xb3:
      e.x -= 1.5
      break
    case 0x38:
      e.x += e.vx
      break
    case 0x71:
      e.x += dir * 1.75
      e.y = e.origin.y + Math.sin(e.age / 24) * 12
      break
    case 0x17:
    case 0x41:
      e.vy += 0.1
      e.y += e.vy
      e.x += e.vx
      break
    case 0x9d:
      e.x += dir * 0.75
      e.y = e.origin.y + Math.sin(e.age / 28) * 8
      if (e.age >= 240) {
        const sprite = [0x0f, 0x0d, 0x15, 0x74][c2 & 3]
        spawnEntity(world, room.id, { spriteId: sprite, x: e.x, y: e.y })
        e.active = false
      }
      break
    case 0x3f:
    case 0x40:
      e.vy = Math.min(1.1, e.vy + 0.06)
      e.vx = Math.sin(e.age / 20)
      moveBody(world, room, e)
      if (e.grounded) {
        e.kind = 'walker'
        e.spriteId = e.spriteId === 0x3f ? 0x0f : 0x0d
        delete e.emission
      }
      break
    default:
      return false
  }
  if (e.y > room.height * 16 + 32 || e.age > 750) e.active = false
  return true
}
