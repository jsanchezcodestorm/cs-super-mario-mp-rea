import assert from 'node:assert/strict'
import { Buttons, createGame, makeSave, stepGame, type CampaignDefinition } from '../src/index.ts'

// Replays start on frame zero of the selected course, as a host resuming the
// automatic save made at the map-to-level transition would.
export function enterFirstCourse(campaign: CampaignDefinition) {
  const map = createGame(campaign)
  assert.equal(map.phase, 'map')
  stepGame(campaign, map, { mario: Buttons.action, luigi: 0 })
  assert.equal(map.phase, 'playing')
  return createGame(campaign, makeSave(map))
}
