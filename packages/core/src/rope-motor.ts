import { palFrame } from './pal-time.ts'
import { climbStepY, jumpFromClimb } from './climb-motion.ts'
import { clipDisplacement } from './terrain.ts'
import { Buttons, type EntityState, type PlayerState, type World } from './types.ts'

function touchesRope(p: PlayerState, rope: EntityState) {
  // E1 clipping profiles $12/$13 are 8×52 and 8×116. GetMarioClipping
  // measures from the feet and counts a shared boundary pixel as contact.
  const x = Math.floor(p.x), feet = Math.floor(p.y + p.height)
  const height = p.form === 'small' || p.ducking ? 12 : 26
  const left = rope.x + 4, top = rope.y + 24
  return x <= left + 8 && x + p.width >= left &&
    feet >= top && feet - height <= rope.y + rope.height - 4
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
  if (pressed & Buttons.jump) {
    delete p.ropeId
    p.ropeReleased = world.state.tick
    jumpFromClimb(world, p)
  } else {
    const climb = input & Buttons.up ? -1 : Number(!!(input & Buttons.down))
    p.vy = climb * climbStepY * (palFrame(world.state.tick) - palFrame(world.state.tick - 1))
  }
  return true
}

export function carryRopePlayer(world: World, rope: EntityState, p: PlayerState, input: number) {
  if (p.ropeReleased !== undefined && palFrame(world.state.tick) - palFrame(p.ropeReleased) < 16) return
  if (!p.ropeId) {
    if (!(input & Buttons.up) || p.netTurn || p.mounted || p.carrying || p.cloud || p.balloon || !touchesRope(p, rope)) return
    delete p.netClinging
    delete p.vineClinging
    delete p.behindNet
    delete p.netPunchTick
    p.ropeId = rope.id
    p.grounded = p.spin = false
    p.flight = p.vx = p.vy = 0
    rope.owner = p.id  // once released, the motor keeps running without a rider
  }
  if (p.ropeId !== rope.id) return
  const room = world.campaign.levels[p.roomId]
  // Contact is checked against the new pin before the sprite advects its rider.
  if (!touchesRope(p, rope)) { delete p.ropeId; return }
  p.y = clipDisplacement(world, room, p, 'y', rope.vy)
  const frame = palFrame(world.state.tick) - palFrame(world.state.tick - 1)
  // The motor pushes a rider whose native origin is above the pin down by
  // one PAL pixel. Held Up still advances by 1.15625, so the very top is open.
  if (frame && Math.floor(p.y + p.height) - 32 < rope.y + 8)
    p.y = clipDisplacement(world, room, p, 'y', 1)
  const previousCenter = rope.x - rope.vx + (rope.width - p.width) / 2
  const offset = Math.max(-frame, Math.min(frame, previousCenter - p.x))
  p.x = clipDisplacement(world, room, p, 'x', rope.vx + offset)
  if (!touchesRope(p, rope)) delete p.ropeId
}
