import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, stepGame, yoshiTongueTip, type BerryTile, type CampaignDefinition, type PlayerId } from '@smw/core'
import { enterFirstCourse } from '../packages/core/test/enter-first-course.ts'
import { spawnEntity } from '../packages/core/src/state.ts'
import { tileAt } from '../packages/core/src/terrain.ts'

const { yoshiTraits } = JSON.parse(readFileSync(new URL('../generated/content.json', import.meta.url), 'utf8'))

function field() {
  const width = 32, height = 14
  const tiles = Array<number>(width * height).fill(0x25)
  tiles.fill(0x130, width * 10)
  const room = { id: 'field', width, height, tiles, spawn: { x: 112, y: 144 }, exits: [], sprites: [] }
  const campaign: CampaignDefinition = { start: room.id, levels: { field: room }, routes: { field: {} }, yoshiTraits }
  const state = enterFirstCourse(campaign)
  for (const p of Object.values(state.players)) {
    p.mounted = true
    p.grounded = true
    p.x = p.id === 'mario' ? 80 : 240
    p.facing = p.id === 'mario' ? 1 : -1
  }
  function drive(mario = 0, luigi = 0) {
    stepGame(campaign, state, { mario, luigi })
  }
  return { state, campaign, room, drive }
}

for (const id of ['mario', 'luigi'] as const) {
  test(id + ' swallows each ROM food with the correct coins, score, power and lives', () => {
    for (const [number, coins, score, lives, form] of [
      [0x0f, 1, 0, 5, 'small'], [0x21, 1, 200, 5, 'small'], [0x74, 0, 1000, 5, 'super'],
      [0x75, 0, 1000, 5, 'fire'], [0x76, 0, 1000, 5, 'small'], [0x77, 0, 1000, 5, 'cape'],
      [0x78, 0, 0, 6, 'small'], [0x28, 0, 0, 5, 'small'],
    ] as const) {
      const g = field(), p = g.state.players[id]
      const other: PlayerId = id === 'mario' ? 'luigi' : 'mario'
      const press = () => g.drive(id === 'mario' ? Buttons.run : 0, id === 'luigi' ? Buttons.run : 0)
      while (p.tongueFrame < 10) press()
      const tip = yoshiTongueTip(p)
      const e = spawnEntity(g, 'field', { x: tip.x, y: tip.y - 6, spriteId: number })!
      press()
      if (number !== 0x28) {
        assert.equal(p.mouth?.entityId, e.id)
        assert.equal(p.score, 0)
      }
      for (let i = 0; i < 60; i++) press()
      assert.deepEqual([p.coins, p.score, p.lives, p.form], [coins, score, lives, form], number.toString(16))
      if (number === 0x76) assert.ok(p.star > 0)
      assert.equal(g.state.players[other].score, 0)
      assert.equal(p.mouth, null)
      assert.equal(p.tongueFrame, 0)
      assert.equal(g.state.entities.includes(e), number === 0x28)
      if (score) assert.deepEqual(g.state.rewardEffects?.map(r => r.award), [score])
    }
  })
}

test('an empty attack displays frames 9–35 of the PAL sequence and a held button cannot repeat it', () => {
  const g = field(), p = g.state.players.mario, lengths = new Map<number, number>()
  let launches = 0
  for (let n = 0; n < 90; n++) {
    g.drive(Buttons.run)
    launches += g.state.events.filter(e => e.type === 'tongue').length
    lengths.set(p.tongueFrame, p.tongue)
  }
  assert.equal(launches, 1)
  assert.equal(p.tongueFrame, 0)
  assert.deepEqual(Array.from({ length: 27 }, (_, i) => lengths.get(i + 9)),
    [3,6,9,12,15,18,21,24,27,30,33,33,33,33,33,33,33,33,29,25,21,17,13,9,5,1,0])
})

test('both riders reaching one berry pay it once; red, pink and green keep their native bonuses', () => {
  for (const passive of [false, true]) for (const tile of [0x45, 0x46, 0x47] as BerryTile[]) {
    const g = field(), p = g.state.players.mario, peer = g.state.players.luigi
    Object.assign(peer, { x: p.x, facing: p.facing })
    p.berries = { red: 9, pink: 1 }
    const col = passive ? 6 : 8, row = passive ? 8 : 9
    g.room.tiles[row * g.room.width + col] = tile
    const before = g.state.timeLeft
    for (let t = 0; t < 38; t++) g.drive(passive ? 0 : Buttons.run, passive ? 0 : Buttons.run)
    assert.equal(tileAt(g, g.room, col, row), 0x49)
    assert.deepEqual([p.coins, p.score, peer.coins, peer.score], [1, 0, 0, 0])
    assert.equal(g.state.timeLeft, before + (tile === 0x47 ? 20 : 0) - Number(g.state.tick % 41 < 38))
    const prize = tile === 0x45 ? 0x74 : tile === 0x46 ? 0x6a : undefined
    assert.equal(p.berryEgg?.spriteId, prize)
    for (let t = 0; prize && t < 48 && p.berryEgg; t++) g.drive()
    assert.ok(!prize || g.state.entities.some(e => e.kind === 'yoshiEgg' && e.eggPrize === prize))
    for (let t = 0; t < 70; t++) g.drive()
    assert.ok(!prize || tile === 0x45 && p.form === 'super' || g.state.entities.some(e => e.spriteId === prize))
  }
})
