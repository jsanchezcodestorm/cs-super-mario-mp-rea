import assert from 'node:assert/strict'
import test from 'node:test'
import { tideSurface, createGame, stepGame, type CampaignDefinition, type LevelDefinition } from '../src/index.ts'
import { moveEntity } from '../src/entity-motion.ts'

function level(): LevelDefinition {
  return {
    id: 'field', width: 64, height: 27, spawn: { x: 32, y: 368 },
    tiles: Array.from({length: 64 * 27}, (_, n) => n >= 24 * 64 ? 0x132 : 0x25),
    sprites: [], exits: [],
  }
}

test('layer three surface matches PAL reference frames for both tide settings', () => {
  const room = level()
  const campaign: CampaignDefinition = { start: room.id, levels: { field: room }, routes: {} }
  const state = createGame(campaign)
  room.tide = 1
  for (const [frame, nativeBG3Y] of [[0,112],[1040,115],[1120,135],[1200,155],[1280,162]]) {
    state.layerOffsets.field = { age: frame * 60 / 50, engaged: false, x: 0, y: 0, dx: 0, dy: 0 }
    assert.equal(tideSurface(room, state), 448 - nativeBG3Y)
  }
  room.tide = 2
  assert.equal(tideSurface(room, state), 384)
})

test('a room loads the three chain decks, the four skulls and both linked Forest decks once', () => {
  const room = level()
  room.sprites = [
    { x: 256, y: 200, spriteId: 0xe0 },
    { x: 256, y: 368, spriteId: 0x61 },
    { x: 192, y: 224, spriteId: 0xc1 },
    { x: 272, y: 224, spriteId: 0xc1 },
  ]
  const campaign: CampaignDefinition = { start: room.id, levels: { field: room }, routes: {} }
  const state = createGame(campaign)
  stepGame(campaign, state, {mario: 128, luigi: 0})
  const chains = state.entities.filter(e => e.spriteId === 0xa3)
  assert.equal(chains.length, 3)
  assert.equal(new Set(chains.map(e => e.chainPhase)).size, 3)
  assert.deepEqual(state.entities.filter(e => e.spriteId === 0x61).map(e => e.x), [256, 272, 288, 304])
  const [left,right] = state.entities.filter(e => e.spriteId === 0xc1)
  left.owner = 'luigi'
  for (let frame = 0; frame < 40; frame++) {
    state.tick++
    for (const deck of [left,right]) moveEntity({campaign, state}, deck, state.players.luigi)
  }
  assert.equal(right.platformStarted, left.platformStarted)
  assert.deepEqual([left.x, right.x, left.y, right.y], [212, 292, 204, 244])
})
