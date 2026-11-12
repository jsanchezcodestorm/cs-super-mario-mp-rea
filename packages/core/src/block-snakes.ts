import type { World, EntityState, LevelDefinition, PlayerState } from './types.ts'
import { changeTile, clipDisplacement, overlaps, tileAt, AIR, USED } from './terrain.ts'
import { die } from './resources.ts'

const steps = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
// CreateEatBlock calls InvisBlkMainRt on the moving head before writing Map16.
// Its top probe is eight pixels above the player's feet. A side contact stops X.
function touchHead(world: World, room: LevelDefinition, head: EntityState, p: PlayerState) {
  if (p.status !== 'alive' || p.roomId !== room.id || !overlaps(p, head)) return
  let axis: 'x' | 'y', target: number
  if (p.y + p.height - 8 < head.y && p.vy >= 0) {
    axis = 'y'
    target = head.y - p.height
    p.grounded = true
    p.vy = 0
  } else if (p.y >= head.y + (p.height === 16 ? 8 : 4)) {
    axis = 'y'
    target = head.y + head.height
    if (p.vy < 0) p.vy = 1
  } else {
    axis = 'x'
    target = p.x + p.width / 2 < head.x + head.width / 2 ? head.x - p.width : head.x + head.width
    p.vx = 0
  }
  p[axis] = clipDisplacement(world, room, p, axis, target - p[axis])
  if (Math.abs(p[axis] - target) > 1 / 256) die(world, p)
}

export function moveBlockSnake(world: World, room: LevelDefinition, e: EntityState) {
  const snake = e.snake
  for (const p of Object.values(world.state.players)) touchHead(world, room, e, p)
  if (!snake?.started) return
  const col = Math.floor(e.x / 16),
    row = Math.floor(e.y / 16)
  if (e.x % 16 === 0 && e.y % 16 === 0) {
    if (snake.eater) {
      changeTile(world, room, col, row, AIR)
      const next = steps.findIndex(([dx, dy]) => tileAt(world, room, col + dx, row + dy) === USED)
      if (next < 0) {
        e.active = false
        return
      }
      snake.direction = next
    } else {
      changeTile(world, room, col, row, USED)
      if (--snake.remaining <= 0) {
        const paths = world.campaign.blockSnakePaths
        if (!paths) throw new Error('Missing ROM block snake paths')
        const command = paths[world.state.progress.course === '020' ? 1 : 0][snake.command++]
        if (command === 0xff) {
          e.active = false
          return
        }
        snake.direction = command & 3
        snake.remaining = command >> 4
      }
    }
  }
  const [dx, dy] = steps[snake.direction]
  e.x += dx
  e.y += dy
}
