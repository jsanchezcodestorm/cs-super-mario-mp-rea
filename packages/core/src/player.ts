import { moveRopePlayer } from './rope-motor.ts'
import { playerPipePosition } from './emergence.ts'
import { reboundGravity, shatterOnLanding } from './spin-block.ts'
import { stepNetClimb } from './net-door.ts'
import { playerAnimation, stepPlayerAnimation } from './player-animation.ts'
import { palFrame } from './pal-time.ts'
import { slopeMotion } from './slope-motion.ts'
import { tideSurface } from './tide.ts'
import { startWallRun, stepWallRun } from './wall-run.ts'
import { releaseReserve } from './rewards.ts'
import { rideCloud } from './lakitu.ts'
import { spinCape } from './cape-spin.ts'
import { duckPlayer, resumePlayerGrowth } from './player-size.ts'
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
  playerAnimation(p).shotUntil = palFrame(world.state.tick) + 10
  emit(world, 'shot', p)
}
function advanceMotion(world: World, room: LevelDefinition, p: PlayerState, input: number, pressed: number, water: boolean, climb: boolean) {
  const direction = Number(!!(input & Buttons.right)) - Number(!!(input & Buttons.left))
  const running = !!(input & Buttons.run)
  if (running && direction !== 0 && p.grounded && Math.abs(p.vx) >= 2)
    p.runTicks = Math.min(64, p.runTicks + 1)
  else if (p.grounded) p.runTicks = Math.max(0, p.runTicks - 2)
  if (p.balloon > 0) {
    duckPlayer(world, p, false, false)
    p.balloon--
    p.vx = approach(p.vx, direction * 1.5, 0.085)
    const vertical = Number(!!(input & Buttons.down)) - Number(!!(input & Buttons.up))
    p.vy = approach(p.vy, vertical * 1.4 - 0.12, 0.07)
    p.grounded = false
    return false
  }
  const onSlope = slopeMotion(world, room, p, input, pressed, water)
  const down = !!(input & Buttons.down)
  const swim = water && (!p.grounded || !!(pressed & (Buttons.jump | Buttons.spin)))
  const spinJump = !p.mounted && !p.carrying && !!(pressed & Buttons.spin)
  duckPlayer(world, p, down, !swim && !spinJump && !climb && !p.flight && !p.sliding)
  // Horizontal input brakes on flat ground during an intentional duck. A
  // player who released Down can still move out from under a low ceiling.
  const moving = p.ducking && p.grounded && down ? 0 : direction
  const max = water ? 1.25 : running ? (p.runTicks === 64 ? 3 : 2.5) : 1.5
  const accel = moving === 0 ? 0.0625 : Math.sign(p.vx) === -moving ? 0.15 : 0.08
  if (!onSlope) p.vx = approach(p.vx, moving * max, accel)
  if (moving && !p.flight) p.facing = moving > 0 ? 1 : -1
  const jump = pressed & (Buttons.jump | Buttons.spin)
  const clinging = climb && !!(input & (Buttons.up | Buttons.down)) && !jump
  if (clinging) {
    p.vy = input & Buttons.up ? -1.5 : 1.5
    p.grounded = false
    return false
  }
  if (jump && (water || p.grounded || climb)) {
    p.spin = spinJump && !water
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
  const airGravity = p.blockRebound ? reboundGravity(holding) : holding && p.vy < 0 ? 0.1875 : 0.375
  const gravity = water ? 0.105 : airGravity
  const terminal = water ? 1.5 : p.form === 'cape' && holding ? 1.3 : 4
  p.vy = Math.min(terminal, p.vy + gravity)
  return !!jump && p.vy < 0 && (water || p.spin || !p.grounded)
}
export function stepPlayer(world: World, p: PlayerState, input: number) {
  if (p.pipeExit && !playerPipePosition(p, world.state.tick)) delete p.pipeExit
  if (p.status !== 'alive') {
    tickDead(world, p)
    return
  }
  resumePlayerGrowth(world, p)
  const room = world.campaign.levels[p.roomId],
    pressed = input & ~p.lastInput
  if (p.formChange && world.state.tick - p.formChange.tick >= 60) delete p.formChange
  for (const key of ['invincible', 'star', 'cooldown'] as const) if (p[key] > 0) p[key]--
  const tileIds = bodyCells(p).map(({ col, row }) => tileAt(world, room, col, row))
  const tide = tideSurface(room, world.state)
  const water = !!room.water || tileIds.some((t) => t >= 0 && t < 5) || (tide !== null && p.y + p.height / 2 >= tide)
  const climb = tileIds.some((t) => t >= 6 && t <= 0x1c)
  if (water) p.spin = false
  if (!p.spin || p.grounded) delete p.blockRebound
  if (pressed & Buttons.reserve) releaseReserve(world, p)
  if (stepWallRun(world, room, p, input, pressed)) {
    stepPlayerAnimation(p, world.state.tick, input, pressed, water, false)
    return
  }
  const jumpOut = !room.water && water && p.vy <= 0 &&
    (input & Buttons.up) && (input & (Buttons.jump | Buttons.spin)) &&
    (tide !== null ? p.y + 2 < tide :
      tileAt(world, room, Math.floor((p.x + p.width / 2) / 16), Math.floor((p.y + 2) / 16)) >= 5)
  const grounded = p.grounded
  const onRope = moveRopePlayer(world, p, input, pressed)
  const onNet = onRope || stepNetClimb(world, room, p, tileIds.some(t => t >= 7 && t <= 0x1c), input, pressed)
  if (!onNet && !rideCloud(world, p, input, pressed) && advanceMotion(world, room, p, input, pressed, water, climb) && (grounded || water || climb))
    emit(world, 'jump', p)
  if (jumpOut) {
    // The PAL surface check assigns signed $AA in sixteenths of a pixel.
    p.vy = -86 / 16
    p.grounded = false
    p.spin = !p.mounted && !p.carrying && !!(input & Buttons.spin)
  }
  stepTongue(world, p, input, pressed)
  const powers = yoshiPowers(p)
  if (powers.wings && !p.grounded) {
    if (pressed & Buttons.jump) p.wingTicks = 16
    if (p.wingTicks > 0) {
      p.vy = Math.max(-2, Math.min(2, p.vy) - 0.5)
      p.wingTicks--
    }
  } else p.wingTicks = 0
  if (!onNet && !p.mounted && pressed & Buttons.run) shoot(world, p)
  if (!onNet && !p.mounted && p.form === 'cape' && pressed & Buttons.run) spinCape(world, room, p)
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
    mount.facing = p.facing
    mount.vx = p.vx
    p.cooldown = 18
  }
  const oldBottom = p.y + p.height
  const intendedFeet = oldBottom + p.vy
  const speed = p.vx
  const contacts = moveBody(world, room, p)
  if (p.sliding && contacts.some((c) => c.side === 'left' || c.side === 'right')) delete p.sliding
  if (contacts.some((hit) => hit.crushed)) {
    die(world, p)
    return
  }
  startWallRun(p, contacts, speed)
  constrainToScroll(world, room, p)
  if (p.status !== 'alive') return
  if (!grounded) shatterOnLanding(world, room, p, contacts, intendedFeet)
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
    delete p.blockRebound
    p.flight = 0
  }
  if (room.id === p.roomId) stepPlayerAnimation(p, world.state.tick, input, pressed, water, climb)
  if (p.roomId === room.id && p.y > room.height * 16 + 2) die(world, p)
}
