import { randomByte } from './sprite-random.ts'
import type { PlayerState, Point } from './types.ts'

export interface CeilingBoo extends Point {
  vx: number
  vy: number
  mode: number
  wait: number
  turn: number
  home: number
}

export function makeCeiling(view: Point, seed: number) {
  const rng = { seed, random: 0 }, ghosts: CeilingBoo[] = []
  for (let slot = 19; slot >= 0; slot--) {
    const high = randomByte(rng)
    rng.random = randomByte(rng)
    const x = view.x + rng.random, y = view.y + 8 + (high & 63)
    ghosts[slot] = { x, y, vx: 0, vy: 0, mode: 0, wait: 0, turn: x & 255, home: y }
  }
  return { ...rng, ghosts }
}

export function moveCeiling(group: ReturnType<typeof makeCeiling>, players: PlayerState[], frame: number, view: Point) {
  for (let slot = 19; slot >= 0; slot--) {
    if (slot === 0 && !(frame & 7)) {
      randomByte(group)
      group.random = randomByte(group)
      const targetSlot = (group.random & 31) % 20
      const ghost = group.ghosts[targetSlot]
      if (!ghost.mode) {
        ghost.x = view.x + ((Math.floor(ghost.x) - view.x) & 255)
        ghost.y = view.y + ((Math.floor(ghost.y) - view.y) & 255)
        const player = players.reduce((a,b) => Math.abs(a.x-ghost.x) < Math.abs(b.x-ghost.x) ? a : b)
        const dx = player.x - ghost.x, dy = player.y + player.height - 16 - ghost.y
        // The routine compares absolute signed low bytes, then reapplies the
        // direction from the full world coordinate.
        const low = (delta: number) => Math.abs((Math.floor(delta) + 128 & 255) - 128)
        const distance = Math.max(1, low(dx), low(dy))
        ghost.vx = Math.sign(dx) * Math.floor(16 * low(dx) / distance)
        ghost.vy = 9 + Math.sign(dy) * Math.floor(16 * low(dy) / distance)
        ghost.mode = 1
        ghost.wait = 32
        ghost.home = Math.floor(ghost.y / 4)*4
      }
    }
    const g = group.ghosts[slot]
    if (g.wait) g.wait--
    if (g.mode) {
      if (g.wait) continue
      g.x += g.vx / 16
      g.y += g.vy / 16
      if (!((slot ^ frame) & 3)) g.vy = Math.max(-32, g.vy - 1)
      if (g.vy < 0 && Math.floor(g.y/4)*4 <= g.home) { g.mode = 0; g.vx = 0 }
    } else {
      if (!g.wait && !(frame & 1)) {
        const delta = g.turn & 1 ? -1 : 1
        g.vx += delta
        if (g.vx === 8*delta) {
          g.turn++
          g.wait = group.random | 63
        }
      }
      g.x += g.vx / 16
      if (!((slot ^ frame) & 3)) g.y += (8 * slot + frame) & 64 ? -1 : 1
    }
  }
}
