import { mapPosition, type OverworldEdge } from '@smw/core';

/** Path samples use PAL frames and global overworld coordinates. */
export function pathPosition(edge: OverworldEdge, ticks: number) {
  const frame = ticks * 50 / 60;
  let previous = edge.path[0];
  for (let i = 1; i < edge.path.length; i++) {
    const next = edge.path[i];
    if (frame >= next[0]) {
      previous = next;
      continue;
    }
    if (next[1] !== previous[1]) break;
    const fraction = (frame - previous[0]) / (next[0] - previous[0]);
    return mapPosition([
      previous[1],
      previous[2] + (next[2] - previous[2]) * fraction,
      previous[3] + (next[3] - previous[3]) * fraction,
    ]);
  }
  return mapPosition([previous[1], previous[2], previous[3]]);
}
