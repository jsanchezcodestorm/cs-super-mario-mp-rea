import type { EntityState, World } from './types.ts'

const swingGravity = 0.9
const swingSpeedLimit = 64
const initialSwingAngle = 448

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
  const swing = (e.swing ??= { angle: initialSwingAngle, speed: 0 })
  const occupied = Object.values(world.state.players).some(
    (p) =>
      p.status === 'alive' &&
      p.roomId === e.roomId &&
      p.vy >= 0 &&
      Math.abs(p.y + p.height - e.y) < 5 &&
      p.x + p.width > e.x &&
      p.x < e.x + e.width,
  )
  // The empty chain behaves as an undamped pendulum. A rider can add energy
  // to the same motion; 512 angle units represent one full revolution.
  const currentRadians = (swing.angle * Math.PI) / 256
  swing.speed -= Math.sin(currentRadians) * swingGravity
  if (occupied) {
    const direction = Math.cos(currentRadians) >= 0 ? 1 : -1
    if (swing.speed * direction >= 0 || e.age % 2 === 0)
      swing.speed += direction
  }
  swing.speed = Math.max(-swingSpeedLimit, Math.min(swingSpeedLimit, swing.speed))
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
