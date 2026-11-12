import type { EntityState, World } from './types.ts'

export function isBlockBridge(entity: EntityState) {
  return entity.spriteId === 0x59 || entity.spriteId === 0x5a
}

function extendBlocks(e: EntityState) {
  // E1 TurnBlkBridgeSpeed, BlkBridgeLength and BlkBridgeTiming in bank 01.
  const cycle = 194
  const time = (e.age - 1) % cycle
  const radius = time < 32 ? time : time < 97 ? 32 : Math.max(0, 129 - time)
  const vertical = e.spriteId === 0x59 && Math.floor((e.age - 1) / cycle) % 2 === 1
  const dx = vertical ? 0 : radius
  const dy = vertical ? radius : 0
  e.x = e.origin.x - dx
  e.y = e.origin.y - dy
  e.width = 16 + 2 * dx
  e.height = 16 + 2 * dy
}

function swingChain(world: World, e: EntityState) {
  const swing = (e.swing ??= { angle: 0, speed: 0 })
  const occupied = Object.values(world.state.players).some(
    (p) =>
      p.status === 'alive' &&
      p.roomId === e.roomId &&
      p.vy >= 0 &&
      Math.abs(p.y + p.height - e.y) < 5 &&
      p.x + p.width > e.x &&
      p.x < e.x + e.width,
  )
  // A rider supplies angular acceleration. Empty platforms lose a speed unit
  // every four ticks. The original stores 512 angle units per revolution.
  if (occupied) {
    const direction = Math.cos((swing.angle * Math.PI) / 256) >= 0 ? 1 : -1
    if (swing.speed * direction >= 0 || e.age % 2 === 0)
      swing.speed = Math.max(-64, Math.min(64, swing.speed + direction))
  } else if (e.age % 4 === 0) swing.speed -= Math.sign(swing.speed)
  swing.angle = (swing.angle + swing.speed / 16 + 512) % 512
  const radians = (swing.angle * Math.PI) / 256
  e.width = 64
  e.height = 16
  e.x = e.origin.x + 40 + Math.round(Math.sin(radians) * 80) - 32
  e.y = e.origin.y + 104 + Math.round(Math.cos(radians) * 80) - 8
}

export function moveBridge(world: World, e: EntityState) {
  if (isBlockBridge(e)) extendBlocks(e)
  else if (e.spriteId === 0x5f) swingChain(world, e)
  else return false
  return true
}
