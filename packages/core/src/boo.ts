import { palFrame } from './pal-time.ts'
import type { EntityState, PlayerState } from './types.ts'

const approach = (speed: number, target: number) => speed + Math.sign(target - speed)

/** E1 $01:F8D9. The sprite checks the player's gaze every 32 PAL frames.
 * Body direction changes halfway through its turn, independently of momentum. */
export function moveBoo(e: EntityState, target: PlayerState, tick: number) {
  const ghost = e.boo ??= { watching: false, check: 0, turn: 0, wait: 0, peek: 0, pose: 0 }
  if (e.facing === undefined) { e.facing = 1; e.vx = e.vy = 0 }
  const frame = palFrame(tick)
  const dx = target.x - e.x, close = dx >= -10 && dx < 10
  const dir = dx < 0 ? -1 : 1
  // The co-op chase runs at 60 Hz. The face, turn and peek use independent PAL timers.
  if (e.spriteId !== 0xaf && target.facing === dir) {
    e.x += (e.x > target.x ? -1 : 1) * 0.48
    e.y += Math.max(-0.36, Math.min(0.36, target.y - e.y))
  }
  if (frame === palFrame(tick - 1)) return
  if (ghost.check > 0) ghost.check--
  if (ghost.peek > 0) ghost.peek--
  if (ghost.turn > 0) ghost.turn--
  if (!ghost.check) {
    ghost.check = 32
    if (!ghost.watching || !close) ghost.watching = target.facing !== dir
  }
  if (!ghost.turn && !close && dir !== e.facing) ghost.turn = 31
  if (ghost.turn === 16) e.facing = e.facing === -1 ? 1 : -1
  const vx = Math.round(e.vx * 16), vy = Math.round(e.vy * 16)
  if (ghost.watching && !ghost.turn) {
    if (e.spriteId === 0xaf || frame % (e.spriteId === 0x28 ? 4 : 2) === 0) {
      if (++ghost.wait === 256) { ghost.peek = 32; ghost.wait = 0 }
      e.vx = approach(vx, 0) / 16
      e.vy = approach(vy, 0) / 16
    }
  } else {
    if (!ghost.turn) ghost.wait = 0
    if ((frame & 7) === 0) {
      e.vx = approach(vx, dir * 8) / 16
      const targetY = target.y + target.height - 32 - (e.spriteId === 0x28 ? 32 : 16)
      e.vy = approach(vy, targetY < e.y ? -8 : 8) / 16
    }
  }
  if (e.spriteId === 0xaf) ghost.pose = Math.abs(e.vx) >= 0.5 ? 0 : Math.abs(e.vx) >= 0.25 ? 1 : 2
  else if (e.spriteId === 0x37) ghost.pose = !ghost.watching ? 0 : ghost.peek ? 2 + ((ghost.peek >> 2) & 1) : 1
  else ghost.pose = ghost.turn ? [1,2,2,1][ghost.turn >> 3] : ghost.watching ? (ghost.peek ? 4 : 3) : 0
  if (e.spriteId === 0xaf) {
    e.x += e.vx
    e.y += e.vy
  }
}
