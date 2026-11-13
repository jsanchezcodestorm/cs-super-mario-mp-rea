import assert from 'node:assert/strict'
import test from 'node:test'
import { createGame, type CampaignDefinition } from '../src/index.ts'
import { spawnEntity } from '../src/state.ts'
import { contact } from '../src/entity-contact.ts'
import { moveCoinGameCloud, moveCloudCoin } from '../src/coin-game-cloud.ts'

const width = 64, height = 24
const tiles = Array<number>(width * height).fill(0x25)
tiles.fill(0x130, width * 20)
const room = { id: 'cloud', width, height, tiles, spawn: { x: 32, y: 272 }, sprites: [], exits: [] }
const campaign: CampaignDefinition = { start: room.id, levels: { cloud: room }, routes: { cloud: {} } }

test('the pink berry cloud drops ten coins; either partner can collect them towards its one 1-UP', () => {
  for (const missed of [false, true]) {
    const state = createGame(campaign), world = { campaign, state }
    const cloud = spawnEntity(world, room.id, { ...room.spawn, spriteId: 0x6a })!
    let count = 0
    for (state.tick = 1; Math.floor(state.tick * 5 / 6) <= 12 * 128; state.tick++) {
      moveCoinGameCloud(world, cloud)
      const coin = state.entities.at(-1)!
      if (coin.kind !== 'cloudCoin' || !coin.active) continue
      count++
      if (missed && count === 10) { coin.active = false; continue }
      for (const p of Object.values(state.players)) Object.assign(p, { x: coin.x, y: coin.y })
      const { mario, luigi } = state.players
      for (const p of count % 2 ? [mario, luigi] : [luigi, mario]) contact(world, coin, p, 0, p.y + p.height)
    }
    assert.equal(count, 10)
    assert.equal(state.players.mario.coins, 5)
    assert.equal(state.players.mario.score, 500)
    assert.equal(state.players.luigi.coins, missed ? 4 : 5)
    assert.equal(state.players.luigi.score, missed ? 400 : 500)
    assert.equal(state.entities.filter(e => e.kind === 'oneUp').length, missed ? 0 : 1)
  }
})

test('a falling cloud coin bounces once, then falls through the floor', () => {
  const state = createGame(campaign), world = { campaign, state }
  const coin = spawnEntity(world, room.id, { x: 50, y: 290, spriteId: 0x0a }, 'cloudCoin')!
  let bounces = 0
  for (state.tick = 1; state.tick < 145; state.tick++) {
    const previous = coin.vy
    moveCloudCoin(world, room, coin)
    if (previous > 0 && coin.vy < 0) bounces++
  }
  assert.equal(bounces, 1)
  assert.ok(coin.y > 320)
})
