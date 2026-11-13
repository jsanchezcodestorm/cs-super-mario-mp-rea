import { nextSpriteRandom } from './sprite-random.ts'
import type { EntityState, World } from './types.ts'

function turn(e: EntityState) {
  e.facing = e.facing === 1 ? -1 : 1
  e.resident!.turn = 10
}

export function stepBird(world: World, e: EntityState) {
  const s = e.resident!
  if (s.timer) s.timer--
  if (s.turn) s.turn--
  e.x += e.vx
  e.y += e.vy
  e.vy += 3 / 16
  s.pose = 0
  if (s.phase) {
    e.vx = e.vy = 0
    if (s.timer) s.pose = Number(s.timer < 8)
    else if (s.hops) {
      s.hops--
      s.timer = (nextSpriteRandom(world.state) & 31) | 10
    } else {
      s.phase = 0
      if (!(nextSpriteRandom(world.state) & 1)) turn(e)
      s.hops = 2 + (nextSpriteRandom(world.state) & 3)
    }
  } else {
    e.vx = e.facing! / 2
    if (e.vy >= 0 && (Math.floor(e.y) & 255) >= 232) {
      e.y = Math.floor(e.y / 8) * 8
      e.vy = -1
      if (e.x < 48 || e.x >= 208) {
        if (!s.timer) {
          turn(e)
          s.timer = 16
        }
      } else if (s.hops) s.hops--
      else {
        s.phase = 1
        s.hops = [2,3,5,1][nextSpriteRandom(world.state) & 3]
      }
    }
  }
  if (s.turn) s.pose = 2
}
