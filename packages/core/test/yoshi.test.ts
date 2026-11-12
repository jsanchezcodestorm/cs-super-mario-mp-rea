import { enterFirstCourse } from './enter-first-course.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  Buttons,
  createGame,
  stepGame,
  makeSave,
  validateSave,
  yoshiPowers,
  type Spawn,
  type CampaignDefinition,
} from '../src/index.ts'
import { entityFromSpawn } from '../src/species.ts'
import { eggColor } from '../src/yoshi-colors.ts'
import { spawnEntity } from '../src/state.ts'

// E1's Sprite1686Vals flags for the standard sprite IDs used by these scenarios.
const traits = Array<number>(201).fill(1)
for (const id of [4, 5, 6, 7]) traits[id] = 2
traits[0x0f] = 0
traits[0x74] = 0x28
traits[0x80] = 0x3a
function game(spawns: Spawn[]) {
  const width = 48,
    height = 14,
    tiles = Array<number>(width * height).fill(0x25)
  tiles.fill(0x130, width * 10)
  const room = { id: 'field', width, height, tiles, spawn: { x: 32, y: 144 }, sprites: spawns, exits: [] }
  const campaign: CampaignDefinition = {
    start: room.id,
    levels: { field: room },
    routes: { field: {} },
    yoshiTraits: traits,
  }
  const state = enterFirstCourse(campaign),
    events: string[] = []
  state.players.luigi.x = 350
  function advance(n: number, mario = 0) {
    for (let i = 0; i < n; i++) {
      stepGame(campaign, state, { mario, luigi: 0 })
      events.push(...state.events.map((e) => e.type))
    }
  }
  advance(20)
  return { advance, state, campaign, events, p: state.players.mario }
}
function withShell(shell: number) {
  const g = game([
    { x: 32, y: 144, spriteId: 0x35 },
    { x: 66, y: 144, spriteId: shell },
  ])
  assert.equal(g.p.mounted, true)
  g.advance(1, Buttons.run)
  g.advance(42)
  return g
}
test('shell colors survive capture and spit; placed shells use their SNES storage IDs', () => {
  for (const [i, color] of ['green', 'red', 'blue', 'yellow'].entries()) {
    const shell = entityFromSpawn('field', { x: 32, y: 144, spriteId: 0xda + i }, '1')!
    assert.equal(shell.spriteId, 4 + i)
    assert.equal(shell.shellColor, color)
    assert.equal(shell.vx, 0)
  }
  assert.deepEqual([0, 16, 32, 48].map(eggColor), ['red', 'blue', 'yellow', 'blue'])
  const g = withShell(0xdc)
  assert.equal(g.p.mouth?.shellColor, 'blue')
  assert.deepEqual(yoshiPowers(g.p), { wings: true, fire: false, stomp: false })
  g.advance(1, Buttons.run)
  const shell = g.state.entities.find((e) => e.kind === 'shell')!
  assert.equal(shell.shellColor, 'blue')
  assert.equal(shell.spriteId, 6)
  assert.ok(shell.vx > 0)
  assert.ok(g.events.includes('tongue') && g.events.includes('spit'))
})
test('a red shell produces three shots with different vertical velocities', () => {
  const g = withShell(0xdb)
  assert.equal(yoshiPowers(g.p).fire, true)
  g.advance(1, Buttons.run)
  const shots = g.state.entities.filter((e) => e.kind === 'yoshiFire')
  assert.equal(shots.length, 3)
  assert.deepEqual(shots.map((e) => e.vy).sort(), [-0.5, 0, 0.5])
  assert.equal(g.p.mouth, null)
  assert.ok(shots.every((e) => e.owner === 'mario'))
})
test('the blue shell grants airborne flaps and the yellow rider defeats nearby enemies on landing', () => {
  const g = withShell(0xdc)
  g.p.yoshiColor = 'yellow'
  g.advance(1, Buttons.jump)
  g.advance(40)
  const airborne = g.p.y
  g.advance(1, Buttons.jump)
  g.advance(8)
  assert.ok(g.p.y < airborne)
  const foe = spawnEntity({ campaign: g.campaign, state: g.state }, 'field', {
    x: g.p.x + 24,
    y: 144,
    spriteId: 0x0f,
  })!
  g.advance(150)
  assert.ok(g.events.includes('yoshiStomp'))
  assert.ok(!g.state.entities.some((e) => e.id === foe.id))
})
test('holding a shell for 255 four-frame intervals swallows it and removes its powers once', () => {
  const g = withShell(0xdc)
  assert.ok(g.p.mouth)
  g.advance(g.p.mouth.ticks - 1)
  assert.ok(g.p.mouth)
  g.advance(1)
  assert.equal(g.p.mouth, null)
  assert.equal(yoshiPowers(g.p).wings, false)
  assert.equal(g.p.coins, 1)
  assert.equal(g.events.filter((e) => e === 'swallow').length, 1)
})
test('Star World colored egg hatches a baby; a mushroom grows it; its color persists when ridden and saved', () => {
  const g = game([{ x: 16, y: 144, spriteId: 0x2c }])
  g.advance(24)
  const baby = g.state.entities.find((e) => e.kind === 'babyYoshi')!
  assert.equal(baby.yoshiColor, 'blue')
  spawnEntity({ campaign: g.campaign, state: g.state }, 'field', { x: baby.x, y: baby.y, spriteId: 0x74 })
  g.advance(1)
  const adult = g.state.entities.find((e) => e.kind === 'yoshi')!
  g.p.x = adult.x
  g.advance(1)
  assert.equal(g.p.mounted, true)
  assert.equal(g.p.yoshiColor, 'blue')
  assert.ok(g.events.includes('yoshiGrow'))
  const save = makeSave(g.state)
  assert.ok(validateSave(g.campaign, save))
  assert.equal(createGame(g.campaign, save).players.mario.yoshiColor, 'blue')
})

test('all 16 shell and Yoshi color pairs compose the PAL abilities', () => {
  const g = withShell(0xdc)
  const colors = ['green', 'red', 'yellow', 'blue'] as const
  // Bank 01, E1 address F137. Bit 0 is ground stomp and bit 1 is flight.
  const ability = [0, 0, 1, 2, 0, 0, 1, 2, 1, 1, 1, 3, 2, 2, 3, 2]
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      g.p.yoshiColor = colors[i]
      g.p.mouth!.shellColor = colors[j]
      assert.deepEqual(
        yoshiPowers(g.p),
        {
          stomp: !!(ability[i * 4 + j] & 1),
          wings: !!(ability[i * 4 + j] & 2),
          fire: i === 1 || j === 1,
        },
        colors[i] + ' Yoshi / ' + colors[j] + ' shell',
      )
    }
})

test('a carried baby eats five ordinary enemies, then grows and frees its carrier', () => {
  const g = game([{ x: 32, y: 144, spriteId: 0x2d }])
  g.advance(1, Buttons.run)
  const baby = g.state.entities.find((e) => e.kind === 'babyYoshi')!
  assert.equal(g.p.carrying, baby.id)
  for (let i = 0; i < 5; i++) {
    spawnEntity({ campaign: g.campaign, state: g.state }, 'field', {
      x: g.p.x + 14,
      y: g.p.y,
      spriteId: 0x0f,
    })
    g.advance(32, Buttons.run)
  }
  assert.equal(baby.kind, 'yoshi')
  assert.equal(g.p.carrying, null)
  assert.equal(g.events.filter((e) => e === 'yoshiGrow').length, 1)
})

test('feeding a carried shell to a baby frees the same player to pick up a key', () => {
  const g = game([])
  const world = { campaign: g.campaign, state: g.state }
  const shell = spawnEntity(world, 'field', { x: g.p.x, y: g.p.y, spriteId: 0xda })!
  g.advance(1, Buttons.run)
  assert.equal(g.p.carrying, shell.id)
  spawnEntity(world, 'field', { x: g.p.x + g.p.width, y: g.p.y, spriteId: 0x2d })
  g.advance(1, Buttons.run)
  assert.ok(!shell.active)
  assert.equal(g.p.carrying, null)
  const key = spawnEntity(world, 'field', { x: g.p.x, y: g.p.y, spriteId: 0x80 })!
  g.advance(1, Buttons.run)
  assert.equal(g.p.carrying, key.id)
})
