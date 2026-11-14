import { spinReboundY } from './land-motion.ts'
import { advanceMotion } from './player-motion.ts'
import { moveRopePlayer } from './rope-motor.ts'
import { playerPipePosition } from './emergence.ts'
import { shatterOnLanding } from './spin-block.ts'
import { climbingHeadInset } from './climb-motion.ts'
import { stepTileClimb } from './tile-climb.ts'
import { playerAnimation, stepPlayerAnimation } from './player-animation.ts'
import { palFrame } from './pal-time.ts'
import { tideSurface } from './tide.ts'
import { startWallRun, stepWallRun } from './wall-run.ts'
import { releaseReserve } from './rewards.ts'
import { rideCloud } from './lakitu.ts'
import { spinCape } from './cape-spin.ts'
import { resumePlayerGrowth } from './player-size.ts'
import { constrainToScroll } from './autoscroll.ts'
import { yoshiPowers } from './yoshi-colors.ts'
import { releaseMouth, stepTongue } from './yoshi-tongue.ts'
import { strike } from './entity-contact.ts'
import { overlaps } from './terrain.ts'
import { standOnTilt } from './arena.ts'
import { Buttons } from './types.ts'
import type { World, PlayerState } from './types.ts'
import { moveBody, tileAt, bodyCells } from './terrain.ts'
import { emit, spawnEntity } from './state.ts'
import { die, tickDead } from './resources.ts'
import { interactTiles } from './blocks.ts'

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
export function stepPlayer(world: World, p: PlayerState, inputSample: number) {
  if (p.pipeExit && !playerPipePosition(p, world.state.tick)) delete p.pipeExit
  // The cartridge's DoorPipeAni and VertPipeAni routines call NoButtons until
  // the pipe timer expires. Keep the same input lock while the sprite emerges.
  const input = p.pipeExit ? 0 : inputSample
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
  const nearClimbable = tileIds.some(t => t >= 6 && t < 0x1d)
  if (water) p.spin = false
  if (pressed & Buttons.reserve) releaseReserve(world, p)
  if (stepWallRun(world, room, p, input, pressed)) {
    stepPlayerAnimation(p, world.state.tick, input, pressed, water)
    return
  }
  const jumpOut = !room.water && water && p.vy <= 0 &&
    (input & Buttons.up) && (input & (Buttons.jump | Buttons.spin)) &&
    (tide !== null ? p.y + 2 < tide :
      tileAt(world, room, Math.floor((p.x + p.width / 2) / 16), Math.floor((p.y + 2) / 16)) >= 5)
  const grounded = p.grounded, incomingY = p.vy
  const heldTile = p.netClinging || p.vineClinging
  const onRope = moveRopePlayer(world, p, input, pressed)
  const climbing = onRope || stepTileClimb(world, room, p, nearClimbable, input, pressed, water)
  const releasedGrip = climbing && !!(pressed & Buttons.jump) && p.vy < 0 && !p.ropeId && !p.netClinging && !p.vineClinging
  const motion = climbing || rideCloud(world, p, input, pressed) ? {} : advanceMotion(world, room, p, input, pressed, water)
  // On the release frame E1 stores the jump speed but still integrates the climbing displacement.
  if (releasedGrip) motion.dy = 0
  if (climbing) delete p.queuedLandJump
  if (motion.jump) emit(world, 'jump', p)
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
  if (!climbing && !p.mounted && pressed & Buttons.run) shoot(world, p)
  if (!climbing && !p.mounted && p.form === 'cape' && pressed & Buttons.run) spinCape(world, room, p)
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
  const intendedFeet = oldBottom + (motion.dy ?? p.vy)
  const speed = p.vx
  const holdsTile = p.netClinging || p.vineClinging
  const inset = climbingHeadInset(p.height)
  const head = heldTile || holdsTile ? { previousInset: heldTile ? inset : 0, inset: holdsTile ? inset : 0 } : undefined
  const vx = p.vx, vy = p.vy
  if (motion.dx !== undefined) p.vx = motion.dx
  if (motion.dy !== undefined) p.vy = motion.dy
  const contacts = moveBody(world, room, p, head)
  if (motion.dx !== undefined && !contacts.some(c => c.side === 'left' || c.side === 'right')) p.vx = vx
  if (motion.dy !== undefined) {
    const landed = contacts.some(c => c.side === 'bottom')
    if (vy < 0 && landed) p.grounded = false
    if ((!landed || vy < 0) && !contacts.some(c => c.side === 'top')) p.vy = vy
  }
  if (p.sliding && contacts.some((c) => c.side === 'left' || c.side === 'right')) delete p.sliding
  if (contacts.some((hit) => hit.crushed)) {
    die(world, p)
    return
  }
  startWallRun(p, contacts, speed)
  constrainToScroll(world, room, p)
  if (p.status !== 'alive') return
  if (!grounded && shatterOnLanding(world, room, p, contacts, intendedFeet))
    p.vy = spinReboundY(incomingY, !!(input & (Buttons.jump | Buttons.spin)))
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
  if (room.id === p.roomId) stepPlayerAnimation(p, world.state.tick, input, pressed, water)
  if (p.roomId === room.id && p.y > room.height * 16 + 2) die(world, p)
}
