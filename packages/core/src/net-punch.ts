import { netKoopaBox } from './net-koopa.ts'
import { palFrame } from './pal-time.ts'
import { showHitAward } from './rewards.ts'
import { emit } from './state.ts'
import type { EntityState, PlayerState, World } from './types.ts'

/** E1 fence punch and cape contact ($00:CFE4, $02:93AE). */
export function punchNetKoopa(world: World, e: EntityState, p: PlayerState) {
  const net = e.netKoopa
  if (!e.active || !net || p.status !== 'alive' || net.behind === !!p.behindNet || !p.netClinging || p.netPunchTick === undefined) return
  const tick = world.state.tick, frame = palFrame(tick)
  const age = frame - palFrame(p.netPunchTick)
  if (age < 1 || age > 7 || !(frame & 1) || frame === palFrame(tick - 1)) return

  // The SNES clips integer sprite origins and counts touching edges as contact.
  const playerX = Math.floor(p.x) - 2
  const handX = playerX + (p.behindNet ? -10 : 6), handY = Math.floor(p.y + p.height) - 30
  const body = netKoopaBox(e), x = Math.floor(body.x), y = Math.floor(body.y)
  if (x > handX + 20 || x + body.width < handX || y > handY + 16 || y + body.height < handY) return

  net.punched = 'hit'
  e.active = false
  e.shellKnockedOut = true
  e.grounded = false
  e.vx = Math.floor(e.x) <= playerX ? -0.5 : 0.5
  e.vy = -5
  showHitAward(world.state, p, e, 100, true)
  emit(world, 'netPunchHit', p)
}
