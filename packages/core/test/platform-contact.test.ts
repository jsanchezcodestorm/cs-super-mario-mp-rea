import assert from 'node:assert/strict'
import test from 'node:test'
import { Buttons, createGame, stepGame, type CampaignDefinition, type LevelDefinition } from '../src/index.ts'
import { isBodyFree } from '../src/terrain.ts'

function stage(spriteId: number, x: number) {
  const room: LevelDefinition = {
    id: 'r', width: 10, height: 12, spawn: { x, y: 80 },
    sprites: [{ spriteId, x: 16, y: 96 }], tiles: Array(120).fill(0x25), exits: []
  }
  room.tiles.fill(0x130, 7 * room.width)
  const campaign: CampaignDefinition = { start: 'r', levels: { r: room }, routes: { r: {} } }
  const state = createGame(campaign)
  stepGame(campaign, state, { mario: Buttons.action, luigi: 0 })
  const players = Object.values(state.players)
  for (const p of players) Object.assign(p, { x, y: 80, grounded: true })
  return { room, world: { campaign, state }, players, deck: state.entities[0],
    step: (mario = 0, luigi = 0) => stepGame(campaign, state, { mario, luigi }) }
}

test('a skull carries its centered rider at the PAL rate and adjacent skulls both propel a rider at the seam', () => {
  const { world, deck, players, step } = stage(0x61, 26)
  const start = deck.x
  players[1].x = start
  for (const skull of world.state.entities) skull.platformStarted = world.state.tick
  for (let frame = 0; frame < 30; frame++) step()
  assert.equal(deck.x - start, 18.75)
  assert.equal(players[1].x - start, 18)
  assert.equal(players[0].x - 26, 25)
  for (const p of players) {
    assert.equal(p.y + p.height, deck.y)
    assert.ok(p.grounded)
  }
  step(Buttons.jump)
  assert.ok(players[0].y + players[0].height < deck.y)
  assert.equal(players[1].y + players[1].height, deck.y)
})

for (const layer of ['foreground', 'moving-layer']) {
  test('a platform cannot carry either rider through a ' + layer + ' wall', () => {
    const { room, world, deck, players, step } = stage(0x5e, 36)
    if (layer === 'foreground') room.tiles[5 * room.width + 3] = 0x130
    else {
      room.layer2 = Array(room.tiles.length).fill(0x25)
      room.layer2[5 * room.width + 2] = 0x130
      world.state.layerOffsets.r = { age: 1, x: 16, y: 0, dx: 0, dy: 0, engaged: true }
    }
    deck.owner = 'mario'
    for (let frame = 0; frame < 12; frame++) {
      step()
      for (const p of players) {
        assert.equal(p.x + p.width, 48)
        assert.ok(isBodyFree(world, room, p))
      }
    }
    assert.ok(deck.x > 32)
  })
}

test('an ascending Forest deck cannot embed either rider in a low ceiling', () => {
  const { room, world, players, deck, step } = stage(0xc1, 26)
  deck.x = deck.origin.x = 32
  deck.owner = 'luigi'
  room.tiles[4 * room.width + 2] = 0x130
  for (let frame = 0; frame < 6; frame++) {
    step()
    for (const p of players) {
      assert.ok(p.y >= 80)
      assert.ok(isBodyFree(world, room, p))
    }
  }
  assert.equal(deck.y, 93)
})

test('a player rising from below passes through a one-way deck; the other can stay on top', () => {
  const { players: [mario, luigi], deck, room, step } = stage(0x5e, 34)
  room.tiles.fill(0x25)
  Object.assign(mario, { y: deck.y + 4, vy: -4, grounded: false })
  step()
  assert.ok(mario.vy < 0)
  assert.ok(mario.y + mario.height > deck.y)
  assert.ok(!mario.grounded)
  assert.equal(luigi.y + luigi.height, deck.y)
  assert.ok(luigi.grounded)
})
