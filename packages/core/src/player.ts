import { releaseReserve } from './rewards.ts'
import { constrainToScroll } from './autoscroll.ts'
import { yoshiPowers } from './yoshi-colors.ts'
import { releaseMouth, stepTongue } from './yoshi-tongue.ts'
import { strike } from './entity-contact.ts'
import { overlaps } from './terrain.ts'
import { standOnTilt } from './arena.ts'
import { Buttons } from './types.ts'
import type { World, PlayerState, LevelDefinition } from './types.ts'
import { limit, moveBody, tileAt, bodyCells } from './terrain.ts'
import { emit, spawnEntity } from './state.ts'
import { die, tickDead } from './resources.ts'
import { interactTiles } from './blocks.ts'

function approach(speed: number, target: number, accel: number) {
  return speed + limit(target - speed, -accel, accel)
}
function shoot(world: World, p: PlayerState) {
  if (p.cooldown || p.form !== 'fire') return
  const shots = world.state.entities.filter((e) => e.owner === p.id && e.kind === 'fireball' && e.active)
  if (shots.length >= 2) return
  const shot = spawnEntity(world, p.roomId, { x: p.x + 8 * p.facing, y: p.y + 7, spriteId: 0x33 }, 'fireball')
  if (shot) {
    shot.vx = 4 * p.facing
    shot.vy = 1
    shot.width = shot.height = 6
    shot.owner = p.id
  }
  p.cooldown = 14
  emit(world, 'shot', p)
}
function advanceMotion(p: PlayerState, input: number, pressed: number, water: boolean, climb: boolean) {
  const direction = Number(!!(input & Buttons.right)) - Number(!!(input & Buttons.left))
  const running = !!(input & Buttons.run)
  if (running && direction !== 0 && p.grounded && Math.abs(p.vx) >= 2)
    p.runTicks = Math.min(64, p.runTicks + 1)
  else if (p.grounded) p.runTicks = Math.max(0, p.runTicks - 2)
  if (p.balloon > 0) {
    p.balloon--
    p.vx = approach(p.vx, direction * 1.5, 0.085)
    const vertical = Number(!!(input & Buttons.down)) - Number(!!(input & Buttons.up))
    p.vy = approach(p.vy, vertical * 1.4 - 0.12, 0.07)
    p.grounded = false
    return false
  }
  const max = water ? 1.25 : running ? (p.runTicks === 64 ? 3 : 2.5) : 1.5
  const accel = direction === 0 ? 0.0625 : Math.sign(p.vx) === -direction ? 0.15 : 0.08
  p.vx = approach(p.vx, direction * max, accel)
  if (direction && !p.flight) p.facing = direction > 0 ? 1 : -1
  const jump = pressed & (Buttons.jump | Buttons.spin)
  const clinging = climb && !!(input & (Buttons.up | Buttons.down)) && !jump
  if (clinging) {
    p.vy = input & Buttons.up ? -1.5 : 1.5
    p.grounded = false
    return false
  }
  if (jump && (water || p.grounded || climb)) {
    p.spin = !p.mounted && !!(pressed & Buttons.spin)
    p.vy = water ? -2.8 : p.spin ? -4.75 : -5.0
    p.vy -= Math.abs(p.vx) * 0.42
    if (!water && p.form === 'cape' && p.runTicks === 64 && !p.spin) {
      p.vy = -8
      p.flight = 1
    }
    p.grounded = false
  }
  const holding = !!(input & (Buttons.jump | Buttons.spin))
  if (p.flight && running && !water && !p.spin) {
    if (p.vy > 0 && direction === -p.facing) p.vy = Math.max(-4, p.vy - 0.35)
    if (pressed & (p.facing === 1 ? Buttons.left : Buttons.right) && p.vy > 0.5) p.vy = -4.4
    p.vx = approach(p.vx, p.facing * 3, 0.14)
  }
  const gravity = water ? 0.105 : holding && p.vy < 0 ? 0.1875 : 0.375
  const terminal = water ? 1.5 : p.form === 'cape' && holding ? 1.3 : 4
  p.vy = Math.min(terminal, p.vy + gravity)
  return !!jump && p.vy < 0 && (water || p.spin || !p.grounded)
}
export function stepPlayer(world: World, p: PlayerState, input: number) {
  if (p.status !== 'alive') {
    tickDead(world, p)
    return
  }
  const room = world.campaign.levels[p.roomId],
    pressed = input & ~p.lastInput
  for (const key of ['invincible', 'star', 'cooldown'] as const) if (p[key] > 0) p[key]--
  const tileIds = bodyCells(p).map(({ col, row }) => tileAt(world, room, col, row))
  const water = !!room.water || tileIds.some((t) => t >= 0 && t < 5)
  const climb = tileIds.some((t) => t >= 6 && t <= 0x1c)
  if (pressed & Buttons.reserve) releaseReserve(world, p)
  const grounded = p.grounded
  if (advanceMotion(p, input, pressed, water, climb) && (grounded || water || climb)) emit(world, 'jump', p)
  stepTongue(world, p, input, pressed)
  const powers = yoshiPowers(p)
  if (powers.wings && !p.grounded) {
    if (pressed & Buttons.jump) p.wingTicks = 16
    if (p.wingTicks > 0) {
      p.vy = Math.max(-2, Math.min(2, p.vy) - 0.5)
      p.wingTicks--
    }
  } else p.wingTicks = 0
  if (!p.mounted && pressed & Buttons.run) shoot(world, p)
  if (p.mounted && pressed & Buttons.spin) {
    releaseMouth(world, p, 0, true)
    p.mounted = false
    p.vy = -5
    const mount = spawnEntity(world, room.id, {
      x: p.x - 18 * p.facing,
      y: p.y + p.height - 16,
      spriteId: 0x35,
    })!
    mount.yoshiColor = p.yoshiColor
    p.cooldown = 18
  }
  const oldBottom = p.y + p.height
  const contacts = moveBody(world, room, p)
  constrainToScroll(world, room, p)
  if (p.status !== 'alive') return
  standOnTilt(world, p, oldBottom)
  if (p.mounted && powers.stomp && !grounded && p.grounded) {
    const shock = { x: p.x - 32, y: p.y + p.height - 4, width: 80, height: 16 }
    for (const e of world.state.entities) {
      if (
        e.roomId === p.roomId &&
        e.active &&
        ['koopa', 'walker', 'jumper', 'rex', 'spiny', 'shell', 'mechakoopa'].includes(e.kind) &&
        overlaps(shock, e)
      )
        strike(world, e, p)
    }
    emit(world, 'yoshiStomp', p)
  }
  interactTiles(world, p, room, input, pressed, contacts)
  if (p.grounded) {
    p.spin = false
    p.flight = 0
  }
  if (p.roomId === room.id && p.y > room.height * 16 + 2) die(world, p)
}
