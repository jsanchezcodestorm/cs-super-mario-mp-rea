import { palFrame } from './pal-time.ts'
import { advanceBuoyantDeck } from './water-platforms.ts'
import { advanceGrowingPipe } from './growing-pipe.ts'
import type { EntityState, PlayerState, World } from './types.ts'

export function initializeLift(e: EntityState) {
  e.vx = 0
  switch (e.spriteId) {
    case 0x41: case 0x42: e.width = 40; break
    case 0x43: e.width = 16; break
    case 0x49: e.width = 32; break
    case 0x55: case 0x57: case 0x5c: case 0x5e: e.width = 80; break
    case 0xb7: case 0xb8: case 0xbb: e.width = e.height = 32; break
    case 0xba:
      e.width = 32
      e.liftTimer = e.origin.x & 16 ? 63 : 255
      break
    case 0xc0: e.y = e.origin.y + 2; break
    case 0xc4: e.width = 64; break
  }
}

// Platforms ($01:B26C) changes the speed by one sixteenth every fourth
// frame. While the timer runs, acceleration pauses but travel continues.
function checkerboard(e: EntityState) {
  let speed = e.spriteId < 0x57 ? e.vx : e.vy
  if (e.liftTimer) e.liftTimer--
  if (!e.liftTimer) {
    e.liftStep = ((e.liftStep ?? 0) + 1) & 3
    if (!e.liftStep) {
      const delta = e.liftReverse ? 1 : -1
      speed += delta / 16
      if (speed === delta) {
        e.liftTimer = e.spriteId === 0x55 ? 8 : 24
        e.liftReverse = !e.liftReverse
      }
    }
  }
  if (e.spriteId < 0x57) { e.vx = speed; e.x += speed }
  else { e.vy = speed; e.y += speed }
}

/** Height of the support point under this player, including Carrot Top's
 * $03:8BAA diagonal surface. The player hitbox starts at native X + 2. */
export function liftSurfaceY(e: EntityState, p: Pick<PlayerState, 'x'>, x = e.x, y = e.y) {
  if (e.spriteId !== 0xb7 && e.spriteId !== 0xb8) return y
  const dx = Math.floor(p.x) - 2 - Math.floor(x)
  const height = e.spriteId === 0xb7 ? 20 - dx : dx + 5
  return y + 2 + Math.max(0, Math.min(32, height))
}

function carrotLift(e: EntityState, frame: number) {
  const phase = Math.floor((frame - 1) / 128) & 3
  e.vx = [-0.5, 0, 0.5, 0][phase]
  e.vy = e.spriteId === 0xb8 ? e.vx : -e.vx
  e.x += e.vx
  e.y += e.vy
}

function timedLift(e: EntityState) {
  if (!e.owner) return
  if (e.liftTimer) e.liftTimer--
  e.vx = 1
  e.x += e.vx
  if (!e.liftTimer) {
    e.y += e.vy
    e.vy = Math.min(4, e.vy + 3 / 16)
  }
}

function sinkingLift(e: EntityState, frame: number) {
  if (!e.owner) return
  e.platformStarted ??= frame - 1
  const elapsed = frame - e.platformStarted
  if (e.spriteId === 0xc0) {
    if (elapsed === 63) { e.active = false; return }
    e.vy = 6 / 16
  } else if (elapsed < 24) e.vy = 3 / 16
  else e.vy = Math.min(65 / 16, e.vy + 2 / 16)
  e.y += e.vy
}

export function moveFreeLift(world: World, e: EntityState, target: PlayerState) {
  const id = e.spriteId, frame = palFrame(e.age)
  if (frame === palFrame(e.age - 1)) return
  if (id === 0x49) advanceGrowingPipe(world, e, target)
  else if (id >= 0x55 && id <= 0x58) checkerboard(e)
  else if (id === 0xb7 || id === 0xb8) carrotLift(e, frame)
  else if (id === 0xba) timedLift(e)
  else if (id === 0xc0 || id === 0xc4) sinkingLift(e, frame)
  else if (id === 0xbb) {
    const t = (frame - 1) % 288
    e.vx = t < 80 ? -1 : t >= 144 && t < 224 ? 1 : 0
    e.x += e.vx
  } else if (id === 0x5e && !world.campaign.levels[e.roomId].tide && !world.campaign.levels[e.roomId].water) {
    if (e.owner) { e.vx = 0.5; e.x += e.vx }
  } else if ((id >= 0x41 && id <= 0x43) || (id >= 0x5b && id <= 0x5e)) {
    advanceBuoyantDeck(world, e)
  }
}
