import type { EntityState } from '@smw/core'
import type { Stage } from './content'

type DrawTile = (atlas: string, tile: number, x: number, y: number, priority?: number, oam?: number) => void

/** Draw the moving stone face from the Castle Map16 edge tiles used by this room. */
export function drawLayerThreeSmash(
  entity: EntityState,
  stage: Stage,
  drawTile: DrawTile,
) {
  const motion = entity.hazardMotion
  if (motion?.type !== 'layer3-smash') return false
  if (motion.phase === 'waiting' || motion.screenX === null) return true

  const left = Math.round(0x30 - motion.screenX)
  const top = Math.round(motion.screenY - 16)
  if (top > 224 || top + 16 < 0 || left > 256 || left + 144 < 0) return true

  for (let column = 0; column < 9; column++) {
    const x = left + column * 16
    if (x <= -16 || x >= 256) continue
    const tile = column === 0 ? 0x163 : column === 8 ? 0x165 : 0x164
    drawTile(stage.atlas, tile, x, top, 3, 64 + column)
  }
  return true
}
