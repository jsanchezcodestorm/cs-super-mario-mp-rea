import type { EntityState, World } from './types.ts'
import { palFrame } from './pal-time.ts'

const swingAngleCycle = 512
const swingPivotOffset = { x: 40, y: 104 }
const swingRadius = 80
const swingSpeedLimit = 64
// The Yoshi's Island 3 reference is already angled and moving when shown.
const initialSwingAngle = 0x140
const initialSwingSpeed = 16
const minimumIdleSwingSpeed = 16

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

function chainOccupied(world: World, e: EntityState) {
  return Object.values(world.state.players).some(
    (p) =>
      p.status === 'alive' &&
      p.roomId === e.roomId &&
      p.vy >= 0 &&
      Math.abs(p.y + p.height - e.y) < 5 &&
      p.x + p.width > e.x &&
      p.x < e.x + e.width,
  )
}

function positionSwingingChain(e: EntityState, angle: number) {
  const radians = (angle * Math.PI * 2) / swingAngleCycle
  const centerX = e.origin.x + swingPivotOffset.x + Math.trunc(Math.cos(radians) * swingRadius)
  const centerY = e.origin.y + swingPivotOffset.y - Math.trunc(Math.sin(radians) * swingRadius)
  e.width = 64
  e.height = 16
  e.x = centerX - 32
  e.y = centerY - 8
}

function swingDirection(angle: number) {
  return ((Math.floor((angle + 0x80) / 0x100) & 1) === 0 ? 1 : -1) as -1 | 1
}

function slowSwingWhenEmpty(frame: number, swing: NonNullable<EntityState['swing']>) {
  if ((frame & 3) !== 0 || Math.abs(swing.speed) <= minimumIdleSwingSpeed) return
  swing.speed += swing.speed > 0 ? -1 : 1
}

function pumpSwing(frame: number, swing: NonNullable<EntityState['swing']>) {
  if ((frame & 1) === 0) return
  const direction = swingDirection(swing.angle)
  const limit = direction * swingSpeedLimit
  if (swing.speed !== limit) {
    const next = swing.speed + direction
    swing.speed = next === 0 ? direction : next
  }
}

function advanceSwing(swing: NonNullable<EntityState['swing']>) {
  // The native routine stores 8 fractional angle bits and adds speed * 16.
  // Angle units are represented here as a number of 1/16 steps.
  swing.angle = (swing.angle + swing.speed / 16 + swingAngleCycle) % swingAngleCycle
}

function swingChain(world: World, e: EntityState) {
  const swing = (e.swing ??= { angle: initialSwingAngle, speed: initialSwingSpeed })
  positionSwingingChain(e, swing.angle)
  const frame = palFrame(world.state.tick)
  if (frame === palFrame(world.state.tick - 1)) return
  const occupied = chainOccupied(world, e)
  if (!occupied) slowSwingWhenEmpty(frame, swing)
  advanceSwing(swing)
  if (occupied) pumpSwing(frame, swing)
}

export function moveBridge(world: World, e: EntityState) {
  if (isBlockBridge(e)) extendBlocks(e)
  else if (e.spriteId === 0x5f) swingChain(world, e)
  else return false
  return true
}
