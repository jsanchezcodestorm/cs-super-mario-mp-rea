import assert from 'node:assert/strict';
import type { CampaignDefinition, GameState } from '@smw/core';
import { bodyCells, effectiveTile, isSolid, TILE } from '../../packages/core/src/terrain.ts';

export function checkSolidContacts(campaign: CampaignDefinition, state: GameState) {
  for (const player of Object.values(state.players)) {
    if (player.status !== 'alive') continue;
    const room = campaign.levels[player.roomId];
    const offset = state.layerOffsets[room.id];
    for (const layer of [1, 2]) {
      if (layer === 2 && !room.layer2?.length) continue;
      const x = player.x - (layer === 2 ? (offset?.x ?? 0) : 0);
      const y = player.y - (layer === 2 ? (offset?.y ?? 0) : 0);
      for (const { col, row } of bodyCells({ ...player, x, y })) {
        if (col < 0 || row < 0 || col >= room.width || row >= room.height) continue;
        const index = row * room.width + col;
        const tile = layer === 2 ? room.layer2![index] : effectiveTile(state, room, index);
        if (!isSolid(tile)) continue;
        // The outer pixel belongs to the gap between the foot and side probes.
        const depth = Math.min(x + player.width - col * TILE, (col + 1) * TILE - x,
          y + player.height - row * TILE, (row + 1) * TILE - y);
        if (depth > 1) assert.fail(`${player.id} overlaps Map16 ${tile.toString(16)} in ${room.id} at ${col},${row}, layer ${layer}, tick ${state.tick} by ${depth.toFixed(2)}px`);
      }
    }
  }
}
