import type { World, EntityState, LevelDefinition } from './types.ts'
import { changeTile, tileAt, AIR, USED } from './terrain.ts'

const steps = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
export function moveBlockSnake(world: World, room: LevelDefinition, e: EntityState) {
  const snake = e.snake
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
