import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, createGame, palFrame, stepGame, type CampaignDefinition } from '@smw/core'
import { enterRoom } from '../packages/core/src/state.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))

function enterCastle(marioSpawn = campaign.levels['101'].spawn, luigiSpawn = marioSpawn) {
  const state = createGame(campaign)
  state.phase = 'playing'
  state.entrance = null
  const { mario, luigi } = state.players
  enterRoom({ campaign, state }, mario, '101', marioSpawn)
  enterRoom({ campaign, state }, luigi, '101', luigiSpawn)
  function drive(ticks: number, marioInput = 0, luigiInput = 0) {
    for (let i = 0; i < ticks; i++) stepGame(campaign, state, { mario: marioInput, luigi: luigiInput })
  }
  return { state, mario, luigi, drive }
}

test('both controllers can traverse the first fence in Iggy’s Castle without holding Up', () => {
  const { mario, luigi, drive } = enterCastle()
  drive(24)
  assert.ok(mario.grounded && luigi.grounded)
  drive(60, Buttons.jump | Buttons.up, Buttons.jump | Buttons.up)
  assert.ok(mario.netClinging && luigi.netClinging)
  drive(12)
  const x = mario.x, y = mario.y
  for (let i = 0; i < 72; i++) {
    drive(1, Buttons.right)
    assert.equal(mario.y, y, 'horizontal input must keep the climber at the same height')
    assert.equal(luigi.y, y)
    assert.ok(mario.netClinging && luigi.netClinging)
  }
  assert.ok(Math.abs(mario.x - x - 60) < 2, 'one pixel per PAL frame across the Map16 seams')
  assert.equal(luigi.x, x)
  const afterRight = mario.x
  drive(72, 0, Buttons.right)
  assert.equal(luigi.x, afterRight)
  assert.equal(luigi.y, y)
  assert.ok(luigi.netClinging)
  drive(24, Buttons.left, Buttons.left)
  assert.ok(mario.x < afterRight && luigi.x < afterRight)
  assert.equal(mario.y, y)
  assert.equal(luigi.y, y)
  drive(1, Buttons.jump)
  assert.ok(!mario.netClinging && mario.vy < 0)
  assert.ok(luigi.netClinging)
  drive(1, 0, Buttons.jump)
  assert.ok(!luigi.netClinging && luigi.vy < 0)
})

test('the outside edges stop an attached climber, while climbing past the bottom releases the grip', () => {
  // Native E1 origins (460,260) near the right edge and (120,260) below the top.
  const { state, mario, luigi, drive } = enterCastle({ x: 462, y: 276 }, { x: 122, y: 276 })
  state.entities = state.entities.filter(e => e.kind !== 'netKoopa')
  drive(3, Buttons.up, Buttons.up)
  drive(100, Buttons.right, Buttons.up)
  assert.ok(mario.netClinging && luigi.netClinging)
  assert.ok(Math.abs(mario.x - 500) < 2, 'the right border stops the outside hand')
  assert.ok(Math.abs(luigi.y + luigi.height - 239) < 2, 'the upper border stops the head')
  const right = mario.x, top = luigi.y
  drive(30, Buttons.right, Buttons.up)
  assert.equal(mario.x, right)
  assert.equal(luigi.y, top)
  drive(1, Buttons.spin)
  assert.ok(mario.netClinging, 'A does not release a climber')
  drive(16, Buttons.left, Buttons.down)
  assert.ok(mario.x < right && luigi.y > top)
  drive(180, 0, Buttons.down)
  assert.ok(mario.netClinging && !luigi.netClinging)
  assert.ok(luigi.grounded)
})

test('small Mario and powered-up Luigi reach the same grate corner at their PAL body heights', () => {
  const nativeX = 460, nativeY = 260
  const { state, mario, luigi, drive } = enterCastle(
    { x: nativeX + 2, y: nativeY + 16 }, { x: nativeX + 2, y: nativeY + 4 },
  )
  state.entities = state.entities.filter(e => e.kind !== 'netKoopa')
  Object.assign(luigi, { form: 'super', height: 28 })
  drive(3, Buttons.down, Buttons.down)
  assert.ok(mario.netClinging && luigi.netClinging, 'Down can also grab a reachable grate')
  drive(120, Buttons.right | Buttons.up, Buttons.right | Buttons.up)
  for (const p of [mario, luigi]) {
    assert.ok(p.netClinging)
    assert.ok(Math.abs(p.x - 500) < 2)
  }
  assert.ok(Math.abs(mario.y + mario.height - 239) < 2)
  assert.ok(Math.abs(luigi.y + luigi.height - 246) < 2)
})


test('jumping off the Iggy fence stores the launch before moving on the following PAL frame', () => {
  const { state, mario, luigi, drive } = enterCastle({ x: 122, y: 276 })
  state.entities = state.entities.filter(e => e.kind !== 'netKoopa')
  function frame(input: number) {
    const previous = palFrame(state.tick)
    do { drive(1, input, input) } while (palFrame(state.tick) === previous)
  }
  for (let n = 0; n < 3; n++) frame(Buttons.up)
  for (let n = 0; n < 6; n++) frame(0)
  assert.ok(mario.netClinging && luigi.netClinging)
  const start = mario.y
  // E1 WRAM capture for both seats, eleven frames holding B from a resting grip.
  for (const [i, native] of [0, -6, -11, -17, -22, -26, -31, -35, -39, -43, -47].entries()) {
    frame(Buttons.jump)
    for (const p of [mario, luigi]) {
      assert.ok(!p.netClinging)
      if (i === 0) assert.equal(p.y, start)
      assert.ok(Math.abs(Math.floor(p.y - start) - native) <= 1)
    }
  }
})
