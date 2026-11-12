import { Buttons, type LevelDefinition, type PlayerState, type World } from './types.ts'
import { isSolid, moveBody, tileAt, type Contact } from './terrain.ts'

export function startWallRun(p: PlayerState, contacts: Contact[], speed: number) {
  if (p.carrying || !p.grounded) return
  const triangle = contacts.find(c => c.side === 'bottom' && (c.tile === 0x1b4 || c.tile === 0x1b5))
  if (!triangle) return
  const direction = triangle.tile === 0x1b4 ? 1 : -1
  if (p.facing !== direction) return
  if (p.mounted) {
    p.vy = -8
    p.grounded = false
    return
  }
  // E1's threshold is a fast run before reaching full flying speed.
  if (speed * direction < 2.5) return
  const edge = (triangle.col + (direction > 0 ? 1 : 0)) * 16
  p.x = direction > 0 ? edge - p.width : edge
  p.wallRun = direction
}

export function stepWallRun(world: World, room: LevelDefinition, p: PlayerState, input: number, pressed: number) {
  const direction = p.wallRun
  if (!direction) return false
  const toward = direction > 0 ? Buttons.right : Buttons.left
  if (!(input & toward) || !(input & Buttons.run) || pressed & (Buttons.jump | Buttons.spin)) {
    p.vx = -2 * direction
    p.vy = -2
    p.grounded = false
    delete p.wallRun
    return true
  }
  const col = Math.floor((direction > 0 ? p.x + p.width + 1 : p.x - 1) / 16)
  const bottom = Math.floor((p.y + p.height - 1) / 16)
  if (!isSolid(tileAt(world, room, col, bottom))) {
    delete p.wallRun
    p.vx = direction * 3
    p.vy = -2
    return false
  }
  p.vx = 0
  p.vy = -3
  const hits = moveBody(world, room, p)
  if (hits.some(hit => hit.side === 'top')) delete p.wallRun
  p.facing = direction
  return true
}
