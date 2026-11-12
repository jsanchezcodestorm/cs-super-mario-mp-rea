import { Buttons, type EntityState, type PlayerState } from './types.ts'
import { limit } from './terrain.ts'

export const isWallSpring = (id: number) => id === 0x6b || id === 0x6c

// Bank 02, PeaBouncerPhysics and DATA_02CDFF/DATA_02CE07. The five
// eight-pixel sections give a stronger rebound farther from the wall.
const held = [-76, -76, -88, -104, -120]
const released = [0, 0, -32, -56, -72]
export function wallBounce(e: EntityState, p: PlayerState, buttons: number) {
  const fromWall = e.spriteId === 0x6b
    ? p.x + p.width / 2 - e.x
    : e.x + e.width - p.x - p.width / 2
  const part = limit(Math.floor(fromWall / 8), 0, 4)
  return (buttons & (Buttons.jump | Buttons.spin) ? held : released)[part] / 16
}
