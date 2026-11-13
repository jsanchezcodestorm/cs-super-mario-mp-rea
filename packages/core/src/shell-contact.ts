import { triggerFlyingQuestion } from './flying-question.ts'
import type { EntityState, World } from './types.ts'
import { awardShellClash, awardShellHit } from './shell-rewards.ts'
import { freeCloud } from './lakitu.ts'
import { catchIncomingShell } from './shell-defense.ts'
import { palFrame } from './pal-time.ts'

// E1 SubSprSprInteract uses a 32x24 window around each sprite origin.
// A nonzero clipping nibble in Sprite1662Vals lowers the contact point by 8.
const lowContact = new Set([
  0x12, 0x19, 0x1a, 0x1e, 0x1f, 0x22, 0x23, 0x24, 0x25, 0x26, 0x29,
  0x2a, 0x3a, 0x3b, 0x3c, 0x44, 0x46, 0x53, 0x83, 0x84, 0x90, 0x91,
  0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x9a, 0xa2, 0xa6, 0xab,
])
// Sprite1656Vals bit 7 gives a puff on defeat instead of a falling body.
const puffOnDefeat = new Set([0x1a, 0x1d, 0x20, 0x2a, 0x4f, 0x50, 0x99])

function contactY(e: EntityState) {
  return Math.floor(e.y + e.height - 16) + (lowContact.has(e.spriteId) ? 10 : 2)
}
function canHit(world: World, shell: EntityState, target: EntityState) {
  if (target.netKoopa?.behind || !target.active || !target.height || target === shell || target.roomId !== shell.roomId) return false
  // Scripted actors may use the graphic ID of an unrelated standard sprite.
  if (target.kind === 'cloudCoin' || target.kind === 'fireball' || target.kind === 'yoshiFire' || target.kind === 'chuckShot' ||
      target.kind === 'pipeDecoy' || target.kind === 'boss' || target.kind === 'endingBoss' ||
      target.kind === 'directionalCoins' || target.kind === 'blockSnake') return false
  const traits = world.campaign.yoshiTraits?.[target.spriteId]
  if (traits === undefined || traits & 8) return false
  const dx = Math.floor(target.x) - Math.floor(shell.x), dy = contactY(target) - contactY(shell)
  return dx >= -16 && dx < 16 && dy >= -12 && dy < 12
}
function knockedOut(world: World, e: EntityState, direction: number) {
  if (e.owner && world.state.players[e.owner].carrying === e.id) world.state.players[e.owner].carrying = null
  if (e.kind === 'lakitu') freeCloud(world, e)
  e.active = false
  if (puffOnDefeat.has(e.spriteId) || e.kind === 'throwBlock') return
  e.shellKnockedOut = true
  e.grounded = false
  // E1 status 02 sets ±$10 and $D0 in sixteenths of a pixel per PAL frame.
  e.vx = direction * 5 / 6
  e.vy = -3 * 5 / 6
}
function isHeld(world: World, e: EntityState) {
  return !!e.owner && world.state.players[e.owner].carrying === e.id
}

export function shellContact(world: World, shell: EntityState) {
  const carried = isHeld(world, shell)
  if (!carried && !shell.vx && !shell.tossed) return
  for (const target of world.state.entities) {
    if (!canHit(world, shell, target) || target.id === shell.bracedBy) continue
    if (target.kind === 'flyingQuestion') {
      triggerFlyingQuestion(world, target, shell.owner)
      continue
    }
    if (!carried && !shell.tossed && catchIncomingShell(target, shell)) continue
    const movingTarget = (target.kind === 'shell' || target.kind === 'throwBlock' || target.kind === 'mechaShell') &&
      (target.vx !== 0 || (!target.grounded && (target.tossed || target.vy !== 0)))
    const direction = Math.sign(shell.vx) || (shell.owner && world.state.players[shell.owner].facing) || 1
    if (carried || isHeld(world, target) || movingTarget) {
      awardShellClash(world.state, shell, target)
      knockedOut(world, shell, -direction)
      knockedOut(world, target, direction)
      return
    }
    awardShellHit(world.state, shell, target)
    knockedOut(world, target, direction)
  }
}

export function stepKnockedOut(world: World, e: EntityState) {
  const room = world.campaign.levels[e.roomId]
  // A punched climber uses sprite status 02 starting on the next PAL frame.
  const punched = e.netKoopa?.punched
  if (e.netKoopa && punched) {
    const tick = world.state.tick
    if (palFrame(tick) === palFrame(tick - 1)) return
    e.netKoopa.punched = 'falling'
  }
  const timeStep = punched ? 1 : 5 / 6
  e.x += e.vx
  e.y += e.vy
  e.vy = Math.min(4 * timeStep, e.vy + (3 / 16) * timeStep ** 2)
  if (e.y > room.height * 16 + 16) delete e.shellKnockedOut
}
