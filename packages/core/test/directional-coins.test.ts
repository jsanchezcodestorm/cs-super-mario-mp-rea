import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Buttons, stepGame, type CampaignDefinition } from '../src/index.ts'
import { bump } from '../src/blocks.ts'
import { enterRoom } from '../src/state.ts'
import { tileAt, USED } from '../src/terrain.ts'
import { enterFirstCourse } from './enter-first-course.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync(new URL('../../../generated/content.json', import.meta.url), 'utf8'))

test('Luigi guides the Valley Ghost House coin trail while Mario moves independently', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }
  const room = campaign.levels['1db'], col = 39, row = 20
  for (const p of Object.values(state.players)) enterRoom(world, p, room.id)
  const hit = { col, row, tile: tileAt(world, room, col, row) }
  assert.equal(hit.tile, 0x114)
  bump(world, state.players.luigi, room, hit)
  assert.equal(tileAt(world, room, col, row), USED)
  const guide = state.entities.find(e => e.kind === 'directionalCoins')!
  assert.equal(guide.owner, 'luigi')
  const run = (input: number) => {
    for (let i = 0; i < 16; i++) stepGame(campaign, state, { mario: Buttons.left, luigi: input })
  }
  run(Buttons.right)
  run(Buttons.left) // cannot reverse across the trail
  run(Buttons.up)
  run(Buttons.up)
  assert.equal(tileAt(world, room, col, row - 1), 0x2b)
  assert.equal(tileAt(world, room, col + 1, row - 1), 0x2b)
  assert.equal(tileAt(world, room, col + 2, row - 1), 0x2b)
  assert.equal(tileAt(world, room, col + 2, row - 2), 0x2b)
  state.pSwitch = 600
  assert.equal(tileAt(world, room, col + 2, row - 2), USED)
  run(Buttons.left)
  run(Buttons.down)
  run(Buttons.down)
  run(Buttons.down)
  assert.equal(guide.active, false, 'stops at its existing trail')
})
