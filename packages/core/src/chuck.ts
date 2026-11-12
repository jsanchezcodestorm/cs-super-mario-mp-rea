import type { World, EntityState, LevelDefinition, PlayerState } from './types.ts'
import { moveBody, changeTile, AIR } from './terrain.ts'
import { spawnEntity } from './state.ts'

function throwBall(world: World, e: EntityState, direction: number, kind: 'rock' | 'football' | 'baseball') {
  const spriteId = kind === 'football' ? 0x1b : 0x48
  const projectile = spawnEntity(
    world,
    e.roomId,
    { x: e.x + (direction > 0 ? 16 : -8), y: e.y + 4, spriteId },
    'chuckShot',
  )
  if (!projectile) return
  projectile.projectile = kind
  projectile.width = projectile.height = kind === 'baseball' ? 8 : 14
  projectile.vx = direction * (kind === 'baseball' ? 1.5 : 1.8)
  projectile.vy = kind === 'baseball' ? 0 : kind === 'football' ? -3.6 : -3
}

export function moveChuckShot(world: World, room: LevelDefinition, e: EntityState) {
  if (e.projectile === 'baseball') e.x += e.vx
  else {
    e.vy = Math.min(4, e.vy + 0.18)
    const hits = moveBody(world, room, e)
    if (e.grounded) e.vy = e.projectile === 'football' ? -(2 + (e.age % 3)) : -2
    if (hits.some((c) => c.side === 'left' || c.side === 'right')) e.active = false
  }
  if (e.age > 260 || e.x < 0 || e.x > room.width * 16) e.active = false
}

export function moveChuck(world: World, room: LevelDefinition, e: EntityState, target: PlayerState) {
  const dx = target.x - e.x,
    direction = Math.sign(dx) || 1
  const hurt = e.stunnedUntil !== undefined && e.age < e.stunnedUntil
  const activeKind = e.hp < 3 ? 0x91 : e.spriteId
  if (hurt) e.vx = 0
  else if (activeKind === 0x46 || activeKind === 0x97 || activeKind === 0x98) {
    e.vx = 0
    if (activeKind === 0x46 && e.age % 96 === 48) throwBall(world, e, direction, 'rock')
    if (activeKind === 0x97 && e.age % 128 === 1) throwBall(world, e, direction, 'football')
    if (activeKind === 0x98 && e.age % 128 >= 64 && e.age % 32 === 6)
      throwBall(world, e, direction, 'baseball')
  } else if (activeKind === 0x95) {
    if (e.grounded && e.age % 32 === 0) e.vy = target.y < e.y - 48 ? -4 : -1
  } else if (activeKind === 0x93) {
    if (e.grounded && e.age % 56 === 0) {
      e.vx = direction * 2
      e.vy = -5
    }
  } else if (activeKind === 0x92 && !e.split && Math.abs(dx) < 80) {
    e.split = true
    for (const vx of [-1, 1]) {
      const clone = spawnEntity(world, room.id, { x: e.x, y: e.y, spriteId: 0x91 })
      if (clone) {
        clone.vx = vx
        clone.vy = -4
      }
    }
  } else if (activeKind !== 0x94 && e.grounded) {
    const close = Math.abs(target.y - e.y) < 48
    if (e.age % 96 >= 24) e.vx = direction * (close ? 1.5 : 1)
    else e.vx = 0
  }
  e.vy = Math.min(4, e.vy + 3 / 16)
  const hits = moveBody(world, room, e)
  if (e.grounded) {
    for (const hit of hits) {
      if (hit.side !== 'left' && hit.side !== 'right') continue
      if (activeKind === 0x91 && (hit.tile === 0x12e || hit.tile === 0x11e)) {
        changeTile(world, room, hit.col, hit.row, AIR)
      } else e.vy = -4
    }
  }
}
