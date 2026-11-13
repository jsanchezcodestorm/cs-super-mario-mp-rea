import { moveBody } from './terrain.ts'
import { spawnEntity } from './state.ts'
import type { EntityState, PlayerState, World } from './types.ts'

function bob(e: EntityState, limit: number) {
  const s = e.resident!
  e.vy += (s.phase & 1 ? -1 : 1) / 16
  if (Math.abs(e.vy) >= limit) s.phase ^= 1
}

export function stepGasBubble(e: EntityState, frame: number) {
  e.x += e.facing!
  if (!(frame & 3)) bob(e, 1)
  e.y += e.vy
  e.resident!.pose = (e.resident!.clock >> 3) & 3
}

export function stepFishingBoo(e: EntityState, target: PlayerState, frame: number) {
  const s = e.resident!
  const direction = target.x < e.x ? -1 : 1
  if (s.timer > 0) s.timer--
  if (s.timer === 16) e.facing = direction
  s.pose = (s.timer ? 8 : 0) + ((frame >> 2) & 7)
  if (!s.timer && !(frame & 63)) s.timer = 32
  e.vx = Math.max(-2, Math.min(2, e.vx + direction / 16))
  if (!(frame & 1)) bob(e, 1)
  e.x += e.vx; e.y += e.vy
}

export function stepBubble(world: World, e: EntityState, target: PlayerState, frame: number) {
  const s = e.resident!
  if (!(frame & 1)) s.timer--
  if (s.timer === 1) {
    const spriteId = [0x0f, 0x0d, 0x15, 0x74][s.variant]
    const released = spawnEntity(world, e.roomId, { x: e.x, y: e.y, spriteId })!
    released.vx = (target.x < e.x ? -1 : 1) * Math.abs(released.vx)
    e.active = false
    return
  }
  if (s.timer >= 8) {
    e.vx = e.facing! * 0.5
    if (!(frame & 1)) bob(e, 0.75)
    if (moveBody(world, world.campaign.levels[e.roomId], e).length) s.timer = 6
  }
  const visible = s.timer >= 96 || (s.timer & 2)
  s.pose = s.variant * 7 + (!visible ? 4 : s.timer < 3 ? 6 : s.timer < 6 ? 5 : (frame >> 3) & 3)
}
