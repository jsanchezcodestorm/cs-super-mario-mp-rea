import type { EntityState } from '@smw/core'
import type { ObjPart } from './object-planes'

const MAP_SIZE = 512
const VIEW_WIDTH = 256
const PLAYFIELD_TOP = 32
const PLAYFIELD_HEIGHT = 192
// The browser floor raster sits 8 px low; the extracted BG3 crop is 2 px high.
const GROUND_ALIGNMENT_Y = 10

/** Queue the original BG3 tilemap window at the crusher's native scroll offset. */
export function drawLayerThreeSmash(
  entity: EntityState,
  image: CanvasImageSource,
  queue: (part: ObjPart) => void,
) {
  const motion = entity.hazardMotion
  if (motion?.type !== 'layer3-smash') return false
  if (motion.phase === 'waiting' || motion.screenX === null) return true

  const scrollX = Math.round(motion.screenX) & (MAP_SIZE - 1)
  const scrollY = (0xa0 - Math.round(motion.screenY) + PLAYFIELD_TOP + 8) & (MAP_SIZE - 1)
  queue({
    image,
    sx: scrollX,
    sy: scrollY,
    w: VIEW_WIDTH,
    h: PLAYFIELD_HEIGHT - GROUND_ALIGNMENT_Y,
    x: 0,
    y: PLAYFIELD_TOP + GROUND_ALIGNMENT_Y,
    priority: 0,
    oam: 0xffff,
  })
  return true
}
