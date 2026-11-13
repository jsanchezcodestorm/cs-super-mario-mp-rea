import { throwSpiny } from './lakitu.ts'
import type { EntityState, PlayerState, World } from './types.ts'

/** E1 $02:E93D. The head looks around before rising the last six pixels. */
export function stepPipeLakitu(world: World, e: EntityState, player: PlayerState, frame: number) {
  const s = e.resident!
  const dx = player.x - e.x
  const face = dx < 0 ? -1 : 1
  if (s.timer > 0) s.timer--
  s.pose = 0
  switch (s.phase) {
    case 0:
      if (!s.timer && (dx < -19 || dx >= 35)) { s.phase = 1; s.timer = 144 }
      break
    case 1:
      if (!s.timer) { e.facing = face; s.phase = 2; s.timer = 12 }
      else if (s.timer >= 124) e.y -= 0.5
      else if (s.timer < 80) e.facing = frame & 32 ? -1 : 1
      break
    case 2:
      if (s.timer) e.y -= 0.5
      else { s.phase = 3; s.timer = 128 }
      break
    case 3:
      if (!s.timer) { s.phase = 4; s.timer = 32 }
      else if (s.timer === 64) {
        throwSpiny(world, e, player)
      } else if (s.timer < 64) s.pose = 1
      break
    case 4:
      if (s.timer) e.y += 0.5
      else { s.phase = 0; s.timer = 80 }
      break
  }
}

/** Blargg first shows its eyes; only its last leap uses the full body. */
export function stepBlargg(e: EntityState, player: PlayerState) {
  const s = e.resident!
  const dx = player.x - e.x
  if (s.timer > 0) s.timer--
  switch (s.phase) {
    case 0:
      if (!s.timer && dx >= -112 && dx < 112) {
        e.facing = dx < 0 ? -1 : 1
        e.vy = -29 / 16
        s.phase = 1
      }
      break
    case 1:
      if (e.vy < 1) { e.y += e.vy; e.vy += 2 / 16 }
      else { s.phase = 2; s.timer = 80; e.vy = 0 }
      break
    case 2:
      if (!s.timer) { s.phase = 3; s.timer = 10 }
      else if (s.timer < 32) e.facing = dx < 0 ? -1 : 1
      else if (!(s.timer & 31)) e.facing = e.facing === 1 ? -1 : 1
      break
    case 3:
      if (s.timer) e.y += 2
      else { s.phase = 4; s.timer = 32; e.vx = e.facing!; e.vy = -30 / 16 }
      break
    case 4:
      if (!s.timer) {
        e.x += e.vx; e.y += e.vy; e.vy += 1 / 16
        if (e.vy >= 2) {
          e.x = e.origin.x; e.y = e.origin.y
          s.phase = 0; s.timer = 64
        }
      }
      break
  }
  s.pose = s.phase !== 4 ? 0 : Math.abs(e.vy + 1/32) < 6/16 ? 2 : 1
}
