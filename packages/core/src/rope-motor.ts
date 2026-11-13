import { palFrame } from './pal-time.ts'
import { clipDisplacement } from './terrain.ts'
import { Buttons, type EntityState, type PlayerState, type World } from './types.ts'

function touchesRope(p: PlayerState, rope: EntityState) {
  // At the native pin the grippable section starts 16 pixels below the motor.
  const left = rope.x + 4, top = rope.y + 24
  return p.x < left + 8 && p.x + p.width > left && p.y < rope.y + rope.height - 4 && p.y + p.height > top
}

export function moveRopePlayer(world: World, p: PlayerState, input: number, pressed: number) {
  if (!p.ropeId) return false
  const rope = world.state.entities.find(e => e.id === p.ropeId && e.roomId === p.roomId && e.active)
  if (!rope || !touchesRope(p, rope) || p.mounted || p.carrying) {
    delete p.ropeId
    return false
  }
  p.grounded = p.spin = false
  p.flight = p.vx = 0
  if (pressed & (Buttons.jump | Buttons.spin)) {
    delete p.ropeId
    p.ropeReleased = world.state.tick
    p.vy = -5 * 5 / 6  // $B0 per PAL frame
  } else {
    const climb = Number(!!(input & Buttons.down)) - Number(!!(input & Buttons.up))
    // The climbing routine stops at the motor. The open bottom lets Mario drop.
    p.vy = climb < 0 && p.y <= rope.y + 24 ? 0 : climb * 5 / 6
  }
  return true
}

export function carryRopePlayer(world: World, rope: EntityState, p: PlayerState, input: number) {
  if (p.ropeReleased !== undefined && palFrame(world.state.tick) - palFrame(p.ropeReleased) < 16) return
  if (!p.ropeId) {
    if (!(input & Buttons.up) || p.mounted || p.carrying || p.cloud || p.balloon || !touchesRope(p, rope)) return
    p.ropeId = rope.id
    p.grounded = p.spin = false
    p.flight = p.vx = p.vy = 0
    rope.owner = p.id  // once released, the motor keeps running without a rider
  }
  if (p.ropeId !== rope.id) return
  const room = world.campaign.levels[p.roomId]
  p.y = clipDisplacement(world, room, p, 'y', rope.vy)
  const previousCenter = rope.x - rope.vx + (rope.width - p.width) / 2
  const centerCorrection = palFrame(world.state.tick) - palFrame(world.state.tick - 1)
  const offset = Math.max(-centerCorrection, Math.min(centerCorrection, previousCenter - p.x))
  p.x = clipDisplacement(world, room, p, 'x', rope.vx + offset)
  if (!touchesRope(p, rope)) delete p.ropeId
}
