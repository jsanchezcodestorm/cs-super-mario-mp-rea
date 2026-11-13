import { moveFreeLift } from './travelling-lifts.ts'
import { moveScalePan } from './scale-platforms.ts'
import { palFrame } from './pal-time.ts'
import { moveBlockEnemy } from './statue-enemies.ts'
import { moveNetKoopa } from './net-koopa.ts'
import { moveMovingHazard } from './hazard-motion.ts'
import { moveBoo } from './boo.ts'
import { stepLevelNpc } from './level-npcs.ts'
import { moveKoopa } from './koopa-motion.ts'
import { moveFlyingQuestion } from './flying-question.ts'
import { moveCoinGameCloud, moveCloudCoin } from './coin-game-cloud.ts'
import { blockItemPosition } from './emergence.ts'
import { braceShell } from './shell-defense.ts'
import { moveShell } from './shell-motion.ts'
import { moveSkull } from './skull-raft.ts'
import { positionChainDeck, stepForestDeck, stepHammerDeck } from './flying-platforms.ts'
import { isWallSpring } from './wall-spring.ts'
import { movePipeBoss } from './pipe-boss.ts'
import { bossFires, updateBossFacing } from './boss-facing.ts'
import { isPipePlant, movePipePlant } from './pipe-plant.ts'
import { castMagic, moveMagic } from './magikoopa.ts'
import { moveTape } from './rewards.ts'
import { moveCloud, moveLakitu } from './lakitu.ts'
import { moveEmission } from './emitters.ts'
import { hatch, feedBaby } from './yoshi-growth.ts'
import { moveLooseYoshi } from './loose-yoshi.ts'
import { moveChuck, moveChuckShot } from './chuck.ts'
import { moveBridge } from './bridges.ts'
import { moveLineGuide } from './line-guides.ts'
import { moveBlockSnake } from './block-snakes.ts'
import { isTiltingArena, tiltFloor } from './arena.ts'
import { limit, moveBody, tileAt, changeTile, AIR } from './terrain.ts'
import { finishCourse } from './campaign.ts'
import { spawnEntity } from './state.ts'
import type { World, PlayerState, EntityState, LevelDefinition } from './types.ts'

function walk(world: World, room: LevelDefinition, e: EntityState, speed: number, bounce = 0) {
  const dir = e.vx < 0 ? -1 : 1
  e.vx = dir * speed
  e.vy = Math.min(4, e.vy + 0.23)
  const contacts = moveBody(world, room, e)
  if (
    contacts.some((c) => c.side === 'left' || c.side === 'right') ||
    e.x <= 0 ||
    e.x >= room.width * 16 - e.width
  )
    e.vx = -dir * speed
  if (e.grounded && bounce) e.vy = -bounce
}
function wave(age: number, period: number) {
  return Math.sin((age * Math.PI * 2) / period)
}
function bossMotion(world: World, e: EntityState, target: PlayerState, room: LevelDefinition) {
  if (e.kind === 'endingBoss') {
    e.x = 112 + wave(e.age, 240) * 76
    e.y = 40 + wave(e.age, 110) * 20
    if (e.age % 150 === 1) spawnEntity(world, room.id, { x: e.x, y: e.y + 24, spriteId: 0xa2 })
  } else if (isTiltingArena(room.id)) {
    const center = e.x + e.width / 2
    if (center < 41 || center > 215) {
      e.vy += 0.28
      e.y += e.vy
      if (e.y + e.height > 192) {
        e.active = false
        finishCourse(world, target)
      }
    } else {
      e.y = tiltFloor(world.state.tick, center) - e.height
      e.x += e.vx
      e.vx *= 0.965
    }
  } else if (e.spriteId === 0xa9) {
    const angle = (e.age * Math.PI) / 256 + ((e.origin.x / 16 - 1) * Math.PI) / 2
    e.x = 128 + Math.cos(angle) * 56 - e.width / 2
    e.y = 90 + Math.sin(angle) * 56 - e.height / 2
  } else if (e.spriteId === 0xc5) {
    e.x += limit(target.x - e.x, -0.4, 0.4)
    e.y += limit(target.y - e.y - 50, -0.3, 0.3)
  } else {
    walk(world, room, e, 0.8)
    if (e.grounded && e.age % 80 === 0) e.vy = -4.6
  }
  if (e.spriteId !== 0xc5) updateBossFacing(e, target)
  if (e.kind === 'boss' && bossFires(e)) {
    const fire = spawnEntity(world, room.id, { x: e.x, y: e.y, spriteId: 0x34 }, 'bullet')
    if (fire) fire.vx = target.x > e.x ? 2 : -2
  }
}
export function moveEntity(world: World, e: EntityState, target: PlayerState) {
  if (e.blockReleaseTick !== undefined && !blockItemPosition(e, world.state.tick)) delete e.blockReleaseTick
  const room = world.campaign.levels[e.roomId]
  e.age++
  if (e.fromEnemyBlock) { moveBlockEnemy(world, e); return }
  if (e.shellDefense && braceShell(world, room, e)) return
  if ((e.spriteId <= 12 || e.spriteId === 0xbd) && (e.kind === 'walker' || e.kind === 'koopa' || e.kind === 'flyer' || e.kind === 'jumper')) {
    moveKoopa(world, room, e, target)
    return
  }
  if (e.kind === 'netKoopa') {
    moveNetKoopa(world, room, e, target)
    return
  }
  if (movePipeBoss(world, room, e)) return
  if (e.reserveDrop) {
    e.y += 1
    if (e.y > room.height * 16 + 16) e.active = false
    return
  }
  if (isWallSpring(e.spriteId)) return
  if (e.kind === 'goal') {
    moveTape(e)
    return
  }
  if (moveEmission(world, room, e)) return
  if (e.spriteId >= 0x62 && e.spriteId <= 0x68) {
    moveLineGuide(world, room, e)
    return
  }
  if (e.kind === 'hazard' || e.spriteId === 0x27) {
    if (moveMovingHazard(world, room, e, target)) {
      if (e.y > room.height * 16 + 96) e.active = false
      return
    }
  }
  switch (e.kind) {
    case 'levelNpc':
      stepLevelNpc(world, e, target)
      break
    case 'coinGameCloud':
      moveCoinGameCloud(world, e)
      break
    case 'cloudCoin':
      moveCloudCoin(world, room, e)
      break
    case 'flyingQuestion':
      moveFlyingQuestion(world, e, target)
      break
    case 'lakitu':
      moveLakitu(world, e, target)
      break
    case 'cloud':
      moveCloud(world, e)
      break
    case 'chuck':
      moveChuck(world, room, e, target)
      break
    case 'chuckShot':
      moveChuckShot(world, room, e)
      break
    case 'blockSnake':
      moveBlockSnake(world, room, e)
      break
    case 'mechakoopa':
    case 'walker':
    case 'koopa':
    case 'rex':
      if (e.spriteId === 0x9b) {
        const frame = palFrame(e.age)
        const cycle = frame - Math.floor(frame / 4)
        const submap = world.campaign.overworldNodes?.[world.state.progress.course]?.region
        e.facing = cycle & (submap ? 16 : 32) ? 1 : -1
      } else walk(world, room, e, e.kind === 'rex' ? 0.75 : 0.6)
      break
    case 'spiny':
      if (e.spriteId === 0x14) {
        walk(world, room, e, Math.abs(e.vx))
        if (e.grounded) {
          e.spriteId = 0x13
          e.vx = target.x < e.x ? -0.6 : 0.6
        }
      } else walk(world, room, e, 0.6)
      break
    case 'jumper':
      walk(world, room, e, 0.8, 3.6)
      break
    case 'coin':
      if (e.lakituCoin) {
        e.vy = Math.min(4, e.vy + 0.18)
        moveBody(world, room, e)
      }
      break
    case 'mushroom':
    case 'oneUp':
      walk(world, room, e, 1)
      break
    case 'star':
      walk(world, room, e, 1.35, 4)
      break
    case 'feather':
      if (e.pickupDelay) {
        e.y += e.vy
        e.vy += 1 / 16
        e.pickupDelay--
        break
      }
      e.x = e.origin.x + wave(e.age, 85) * 14
      e.vy = Math.min(1, e.vy + 0.02)
      moveBody(world, room, e)
      break
    case 'yoshiEgg':
      hatch(world, e, target)
      break
    case 'babyYoshi':
      walk(world, room, e, 0, 1)
      feedBaby(world, e, target)
      break
    case 'yoshiFire':
      e.x += e.vx
      e.y += e.vy
      if (e.age >= 160) e.active = false
      break
    case 'fireball':
      walk(world, room, e, 4, 3.2)
      if (e.age > 150) e.active = false
      break
    case 'vine': {
      const col = Math.floor(e.x / 16),
        row = Math.floor(e.y / 16)
      const tile = tileAt(world, room, col, row)
      if (e.y < 0 || (tile !== AIR && tile !== 6)) {
        e.active = false
        break
      }
      changeTile(world, room, col, row, 6)
      e.y -= 1
      break
    }
    case 'balloon':
      e.x = e.origin.x + wave(e.age, 90) * 8
      e.y = e.origin.y - Math.min(26, e.age * 0.22)
      break
    case 'throwBlock':
    case 'mechaShell':
      if (e.owner && e.vy < 0) {
        e.vy += 0.15
        e.x += e.vx
        e.y += e.vy
      } else {
        e.vy = Math.min(4, e.vy + 0.2)
        moveBody(world, room, e)
      }
      break
    case 'shell':
      moveShell(world, room, e, target)
      break
    case 'yoshi':
      moveLooseYoshi(world, room, e)
      break
    case 'key':
    case 'switch':
    case 'spring':
      e.vy = Math.min(4, e.vy + 0.23)
      moveBody(world, room, e)
      break
    case 'flyer':
      if (e.eerieAcceleration !== undefined) {
        e.x += e.vx
        e.vy += e.eerieAcceleration / 16
        if (Math.abs(e.vy) >= 1.5) e.eerieAcceleration *= -1
        e.y += e.vy
        break
      }
    case 'fish': {
      const previousX = e.x
      e.x = e.origin.x + wave(e.age, 200) * 34
      e.y = e.origin.y + wave(e.age, e.kind === 'fish' ? 140 : 105) * 16
      if (e.x !== previousX) e.facing = e.x < previousX ? -1 : 1
      break
    }
    case 'plant':
      if (isPipePlant(e.spriteId)) movePipePlant(world, room, e, target)
      else e.y = e.origin.y + Math.max(0, wave(e.age, 170)) * 23
      break
    case 'boo':
      moveBoo(e, target, world.state.tick)
      break
    case 'bullet':
      e.x += Math.sign(e.vx) * (e.spriteId === 0x9f ? 1 : 2.5)
      break
    case 'platform':
      if (e.scale) { moveScalePan(world, e); return }
      if (e.spriteId === 0x9c) {
        stepHammerDeck(world, e)
        break
      }
      if (e.spriteId === 0xc1) {
        stepForestDeck(world, e)
        break
      }
      if (e.spriteId === 0xa3) {
        positionChainDeck(e)
        break
      }
      if (moveBridge(world, e)) break
      if (e.spriteId === 0x61) {
        moveSkull(world, room, e)
        break
      }
      moveFreeLift(world, e, target)
      break
    case 'magikoopa':
      castMagic(world, e, target)
      break
    case 'magic':
      moveMagic(world, room, e)
      break
    case 'boss':
    case 'endingBoss':
      bossMotion(world, e, target, room)
      break
  }
  if (e.y > room.height * 16 + 96) e.active = false
}
