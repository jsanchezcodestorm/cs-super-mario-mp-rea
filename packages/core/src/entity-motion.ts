import { moveTape } from './rewards.ts'
import { moveEmission } from './emitters.ts'
import { hatch, feedBaby } from './yoshi-growth.ts'
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
  if (e.kind === 'boss' && e.age % 190 === 0) {
    const fire = spawnEntity(world, room.id, { x: e.x, y: e.y, spriteId: 0x34 }, 'bullet')
    if (fire) fire.vx = target.x > e.x ? 2 : -2
  }
}
export function moveEntity(world: World, e: EntityState, target: PlayerState) {
  const room = world.campaign.levels[e.roomId]
  e.age++
  if (e.reserveDrop) {
    e.y += 1
    if (e.y > room.height * 16 + 16) e.active = false
    return
  }
  if (e.kind === 'goal') {
    moveTape(e)
    return
  }
  if (moveEmission(world, room, e)) return
  if (e.spriteId >= 0x62 && e.spriteId <= 0x68) {
    moveLineGuide(world, room, e)
    return
  }
  switch (e.kind) {
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
    case 'spiny':
    case 'rex':
      walk(world, room, e, e.kind === 'rex' ? 0.75 : 0.6)
      break
    case 'jumper':
      walk(world, room, e, 0.8, 3.6)
      break
    case 'mushroom':
    case 'oneUp':
      walk(world, room, e, 1)
      break
    case 'star':
      walk(world, room, e, 1.35, 4)
      break
    case 'feather':
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
      if (e.rainbow) e.vx += limit(target.x - e.x, -0.12, 0.12)
      walk(world, room, e, e.rainbow ? 2.6 : Math.abs(e.vx) > 1 ? 3.5 : 0)
      break
    case 'yoshi':
    case 'key':
    case 'switch':
    case 'spring':
      e.vy = Math.min(4, e.vy + 0.23)
      moveBody(world, room, e)
      break
    case 'flyer':
    case 'fish':
      e.x = e.origin.x + wave(e.age, 200) * 34
      e.y = e.origin.y + wave(e.age, e.kind === 'fish' ? 140 : 105) * 16
      break
    case 'plant':
      e.y = e.origin.y + Math.max(0, wave(e.age, 170)) * 23
      break
    case 'boo': {
      const dir = e.x > target.x ? 1 : -1
      if (target.facing !== dir) {
        e.x -= dir * 0.48
        e.y += limit(target.y - e.y, -0.36, 0.36)
      }
      break
    }
    case 'bullet':
      e.x += Math.sign(e.vx) * (e.spriteId === 0x9f ? 1 : 2.5)
      break
    case 'hazard':
      if (e.spriteId === 0x26 || e.spriteId === 0xac || e.spriteId === 0xad)
        e.y = e.origin.y + Math.max(0, wave(e.age, 140)) * 52
      else if (e.spriteId === 0x9e || e.spriteId === 0x65 || e.spriteId === 0x66) {
        e.x = e.origin.x + wave(e.age, 170) * 24
        e.y = e.origin.y + wave(e.age + 43, 170) * 24
      }
      break
    case 'platform':
      if (moveBridge(world, e)) break
      if (e.spriteId === 0x61 || e.spriteId === 0x5e) {
        if (e.owner) e.x += 1.4
        break
      }
      if ([0x43, 0x57, 0x58].includes(e.spriteId)) e.y = e.origin.y + wave(e.age, 210) * 40
      else if ([0x5c, 0xc4].includes(e.spriteId)) {
        if (e.owner) {
          e.vy += 0.03
          e.y += e.vy
        }
      } else e.x = e.origin.x + wave(e.age, 230) * 47
      break
    case 'boss':
    case 'endingBoss':
      bossMotion(world, e, target, room)
      break
  }
  if (e.y > room.height * 16 + 96) e.active = false
}
