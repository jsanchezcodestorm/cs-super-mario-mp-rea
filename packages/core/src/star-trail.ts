import { randomByte } from './sprite-random.ts'
import { palFrame } from './pal-time.ts'
import type { PlayerState, Point } from './types.ts'

export interface StarTrail {
  seed: number
  sparks: (Point & { born: number; slot: number })[]
}

function identitySeed(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function stepStarTrail(p: PlayerState, tick: number) {
  if (!p.starTrail && !p.star) return
  const frame = palFrame(tick)
  if (frame === palFrame(tick - 1)) return
  const trail = p.starTrail ??= { seed: identitySeed(p.id), sparks: [] }
  trail.sparks = trail.sparks.filter(s => frame - s.born < 23)
  const timer = Math.ceil(palFrame(p.star) / 4)
  if (!p.star && !trail.sparks.length) { delete p.starTrail; return }
  const mask = [7, 3, 3, 1, 1, 1, 1, 1][Math.min(7, timer >> 5)]
  if (timer < 8 || frame & mask || p.status !== 'alive') return
  let slot = 11
  while (slot >= 0 && trail.sparks.some(s => s.slot === slot)) slot--
  if (slot < 0) return
  const dx = (randomByte(trail) & 15) - 2
  const small = p.form === 'small'
  const dy = (randomByte(trail) & (small ? 15 : 31)) + (small ? 16 : 0)
  trail.sparks.push({ x: Math.round(p.x + p.width / 2 - 8 + dx), y: Math.round(p.y + p.height - 32 + dy), born: frame, slot })
}
