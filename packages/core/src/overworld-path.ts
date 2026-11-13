import { mapPosition } from './overworld.ts'
import type { OverworldCommand, OverworldEdge } from './types.ts'

// Continuous captured walks top out at 1.24 pixels per PAL frame. Larger
// same-region jumps are coordinate resets before the ROM updates the submap.
const maxWalkSpeed = 1.5

function isSubmapCoordinateReset(from: OverworldEdge['path'][number], to: OverworldEdge['path'][number], command: OverworldCommand) {
  if (command === 'action') return false
  const frames = to[0] - from[0]
  const distance = Math.hypot(to[2] - from[2], to[3] - from[3])
  return distance > frames * maxWalkSpeed
}

/** Path samples use PAL frames and global overworld coordinates. */
export function pathPosition(edge: OverworldEdge, ticks: number, command: OverworldCommand) {
  const frame = ticks * 50 / 60
  let previous = edge.path[0]
  for (let i = 1; i < edge.path.length; i++) {
    const next = edge.path[i]
    if (frame >= next[0]) {
      if (next[1] === previous[1] && isSubmapCoordinateReset(previous, next, command)) continue
      previous = next
      continue
    }
    if (next[1] !== previous[1]) break
    if (isSubmapCoordinateReset(previous, next, command))
      return mapPosition([previous[1], previous[2], previous[3]])
    const fraction = (frame - previous[0]) / (next[0] - previous[0])
    return mapPosition([
      previous[1],
      previous[2] + (next[2] - previous[2]) * fraction,
      previous[3] + (next[3] - previous[3]) * fraction,
    ])
  }
  return mapPosition([previous[1], previous[2], previous[3]])
}
