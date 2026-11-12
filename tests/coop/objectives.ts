import type { CampaignDefinition, ExitKind, Spawn } from '@smw/core';

// The PAL file-select counter has 72 regular objectives and 24 alternate ones.
// The two service areas and the two doors to Bowser never increment the counter.
const uncounted = new Set(['003', '104', '10d', '10e']);
const doubleExit = new Set('004 009 00a 00f 013 015 023 024 109 10f 114 115 118 11a 11d 11e 11f 120 123 130 132 134 135 136'.split(' '));

export type Objective = { course: string; kind: ExitKind; id: string };
export function objectives(campaign: CampaignDefinition): Objective[] {
  return Object.keys(campaign.names!).filter((id) => !uncounted.has(id)).flatMap((course) => {
    const kinds: ExitKind[] = doubleExit.has(course) ? ['normal', 'secret'] : ['normal'];
    return kinds.map((kind) => ({ course, kind, id: course + ':' + kind }));
  });
}

export function findTrigger(campaign: CampaignDefinition, { course, kind }: Objective) {
  const reachable = new Set([course]);
  if (course === '024')
    for (const id of Object.keys(campaign.levels)) if (id.startsWith('ci2-')) reachable.add(id);
  for (const roomId of reachable) {
    const room = campaign.levels[roomId];
    for (const exit of room.exits) reachable.add(exit.target);
    for (const spawn of room.sprites) {
      const goal = spriteGoal(spawn, course);
      if (goal === kind) return { room, spawn };
    }
    if (kind === 'normal') {
      const tile = room.tiles.findIndex((t) => t >= 0xec && t <= 0xfb && (t - 0xec) % 4 < 2);
      if (tile >= 0) return { room, tile };
    }
  }
  throw Error('No reachable ROM goal for ' + course + ':' + kind);
}

function spriteGoal(spawn: Spawn, course: string): ExitKind | undefined {
  switch (spawn.spriteId) {
    case 0x7b: return spawn.extra ? 'secret' : 'normal';
    case 0x0e: return 'secret';
    case 0xc5: return course === '013' ? 'secret' : 'normal';
    case 0x29:
    case 0x4a:
    case 0xa9: return 'normal';
  }
}
