import type { EntityState, PlayerState } from './types.ts'
import { playerContactBody } from './player-size.ts'
import { overlaps } from './terrain.ts'

export interface ContactRect {
  x: number
  y: number
  width: number
  height: number
}

export interface HazardSweep {
  previousPlayer?: ContactRect
  previousHazard?: ContactRect | null
}

export function isHazardContactEntity(entity: EntityState) {
  return entity.kind === 'hazard' || entity.spriteId === 0x27 ||
    (entity.spriteId === 0xb3 && entity.kind === 'bullet')
}

/** Use the moving part's body, not the invisible pivot, for articulated hazards. */
export function hazardContactBody(entity: EntityState): ContactRect | null {
  if (!isHazardContactEntity(entity)) return null
  const motion = entity.hazardMotion
  if (motion?.type === 'podoboo' && motion.phase === 'waiting') return null
  if (motion?.type === 'falling-spike' && motion.phase !== 'armed') return null
  if (motion?.type === 'ball-and-chain')
    return { ...motion.ball, width: entity.width, height: entity.height }
  if (entity.spriteId === 0xb3)
    return { x: entity.x + 4, y: entity.y + 4, width: 8, height: 4 }
  return { x: entity.x, y: entity.y, width: entity.width, height: entity.height }
}

function center(rect: ContactRect) {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function sweptOverlap(previousPlayer: ContactRect, player: ContactRect,
  previousHazard: ContactRect, hazard: ContactRect) {
  const oldPlayerCenter = center(previousPlayer)
  const playerCenter = center(player)
  const oldHazardCenter = center(previousHazard)
  const hazardCenter = center(hazard)
  const startX = oldPlayerCenter.x - oldHazardCenter.x
  const startY = oldPlayerCenter.y - oldHazardCenter.y
  const velocityX = (playerCenter.x - oldPlayerCenter.x) - (hazardCenter.x - oldHazardCenter.x)
  const velocityY = (playerCenter.y - oldPlayerCenter.y) - (hazardCenter.y - oldHazardCenter.y)
  const halfWidth = (Math.max(previousPlayer.width, player.width) +
    Math.max(previousHazard.width, hazard.width)) / 2
  const halfHeight = (Math.max(previousPlayer.height, player.height) +
    Math.max(previousHazard.height, hazard.height)) / 2
  let entry = -Infinity
  let exit = Infinity

  for (const [position, velocity, extent] of [
    [startX, velocityX, halfWidth],
    [startY, velocityY, halfHeight],
  ]) {
    if (velocity === 0) {
      if (Math.abs(position) >= extent) return false
      continue
    }
    let near = (-extent - position) / velocity
    let far = (extent - position) / velocity
    if (near > far) [near, far] = [far, near]
    entry = Math.max(entry, near)
    exit = Math.min(exit, far)
    if (entry >= exit) return false
  }
  return entry < 1 && exit > 0
}

export function touchesHazard(entity: EntityState, player: PlayerState, sweep?: HazardSweep) {
  const hazard = hazardContactBody(entity)
  if (!hazard) return false
  const playerBody = playerContactBody(player)
  if (overlaps(playerBody, hazard)) return true
  if (!sweep?.previousPlayer || !sweep.previousHazard) return false
  return sweptOverlap(sweep.previousPlayer, playerBody, sweep.previousHazard, hazard)
}
