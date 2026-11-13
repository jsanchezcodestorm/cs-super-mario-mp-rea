import { palFrame } from './pal-time.ts'
import { stepBowserStatue, stepExplodingBlock, statueContact } from './statue-enemies.ts'
import { stepBird } from './house-birds.ts'
import { stepBlargg, stepPipeLakitu } from './emerging-npcs.ts'
import { stepBubble, stepFishingBoo, stepGasBubble } from './floating-npcs.ts'
import { hurt } from './resources.ts'
import { overlaps, clipDisplacement } from './terrain.ts'
import type { EntityState, PlayerState, World } from './types.ts'

export interface LevelNpc {
  clock: number
  phase: number
  pose: number
  timer: number
  variant: number
  turn: number
  hops: number
}

export function stepLevelNpc(world: World, e: EntityState, target: PlayerState) {
  if (!e.resident) {
    const bubble = e.spriteId === 0x9d
    e.resident = { phase: 0, pose: 0, timer: bubble ? 255 : 0, variant: bubble ? (e.origin.x >> 4) & 3 : 0,
      turn: 0, clock: 0, hops: 0 }
    // Yoshi's House allocates slots 9, 8, 7, 6 in placement order (x=64..112).
    if (e.spriteId === 0x8a) e.resident.variant = (13 - (e.origin.x >> 4)) & 3
    e.facing = e.spriteId === 0x90 || bubble ? (target.x < e.x ? -1 : 1) : 1
    if (e.spriteId === 0x4c || e.spriteId === 0xbc) {
      e.resident.variant = (e.origin.x >> 4) & 3
      e.facing = -1
      // Stable slot staggering for the cooperative simulation.
      e.resident.phase = world.campaign.levels[e.roomId].sprites.findIndex(
        spawn => spawn.spriteId === e.spriteId && spawn.x === e.origin.x && spawn.y === e.origin.y) % 12
    }
    e.vx = e.vy = 0
    if (e.spriteId === 0x4b) { e.x += 8; e.y-- }
  }
  const frame = palFrame(world.state.tick)
  if (frame === palFrame(world.state.tick - 1)) return
  const s = e.resident
  s.clock++
  switch (e.spriteId) {
    case 0xbc: stepBowserStatue(world, e, target, frame); break
    case 0x4c: stepExplodingBlock(world, e, target); break
    case 0x8a: stepBird(world, e); break
    case 0x4b: stepPipeLakitu(world, e, target, frame); break
    case 0x90: stepGasBubble(e, frame); break
    case 0x9d: stepBubble(world, e, target, frame); break
    case 0xa8: stepBlargg(e, target); break
    case 0xae: stepFishingBoo(e, target, frame); break
  }
}

export function residentContact(world: World, e: EntityState, p: PlayerState, previousBottom: number) {
  const s = e.resident
  if (e.spriteId === 0xaf) {
    if (e.boo?.pose === 0) return false
    if (!overlaps(e, p)) return true
    if (previousBottom <= e.y + 2 && p.vy >= 0) {
      p.y = clipDisplacement(world, world.campaign.levels[e.roomId], p, 'y', e.y - p.height - p.y)
      p.vy = 0; p.grounded = true
    } else if (p.vy < 0 && previousBottom - p.height >= e.y + e.height - 2) {
      p.y = e.y + e.height; p.vy = 0
    } else {
      const left = p.x + p.width / 2 < e.x + e.width / 2
      p.x = clipDisplacement(world, world.campaign.levels[e.roomId], p, 'x', (left ? e.x-p.width : e.x+e.width) - p.x)
      p.vx = 0
    }
    return true
  }
  if (e.kind !== 'levelNpc') return false
  if (e.spriteId === 0xbc) { statueContact(world, e, p, previousBottom); return true }
  if (e.spriteId === 0x4c) return true
  if (!s || e.spriteId === 0x8a || (e.spriteId === 0xa8 && s.phase !== 4)) return true
  if (e.spriteId === 0x9d) {
    if (s.timer >= 7 && overlaps(p,e)) { s.timer = 6; p.vx = p.vy = 0 }
    return true
  }
  const body = e.spriteId === 0x90 ? { x:e.x+8, y:e.y+16, width:32, height:40 }
    : { x:e.x+2, y:e.y+3, width:12, height:10 }
  if (e.spriteId === 0xae) {
    const offset = e.facing === -1 ? (s.timer ? -8 : -18) : (s.timer ? 20 : 26)
    if (overlaps(p,{x:e.x+offset,y:e.y+71,width:4,height:4})) hurt(world,p)
  }
  if (overlaps(body,p)) {
    if (e.spriteId === 0x4b && previousBottom <= e.y + 6 && p.vy >= 0) {
      e.active = false; p.vy = -3.1
    } else hurt(world,p)
  }
  return true
}
