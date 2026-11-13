import { enterFirstCourse } from '../packages/core/test/enter-first-course.ts'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, createGame, palFrame, stepGame } from '@smw/core'
import type { Content } from '../apps/web/src/game/content.ts'
import { frameForEntity } from '../apps/web/src/game/actors-view.ts'
import { moveEntity } from '../packages/core/src/entity-motion.ts'
import { entityFromSpawn } from '../packages/core/src/species.ts'

const campaign: Content = JSON.parse(readFileSync('generated/content.json', 'utf8'))
const frames = JSON.parse(readFileSync('generated/creatures.json', 'utf8')).frames
const atlas = { has: (key: string) => Object.hasOwn(frames, key) }

test('all placed rail decks and motors use the moving pin and the matching native deck or rope length', () => {
  let count = 0
  for (const room of Object.values(campaign.levels)) for (const source of room.sprites) {
    if (source.spriteId < 0x62 || source.spriteId > 0x64) continue
    const state = createGame(campaign), world = { campaign, state }
    const deck = entityFromSpawn(room.id, source, 'deck')!
    if (source.spriteId !== 0x62) {
      for (let i = 0; i < 8; i++) moveEntity(world, deck, state.players.mario)
      const pin = [deck.x, deck.y]
      for (let i = 0; i < 8; i++) moveEntity(world, deck, state.players.mario)
      assert.deepEqual([deck.x, deck.y], pin)
      deck.owner = 'luigi'
    }
    const path = new Set<string>()
    for (let i = 0; i < 90; i++) {
      moveEntity(world, deck, state.players.luigi)
      path.add(deck.x + ',' + deck.y)
      const key = frameForEntity(deck, deck.age, room.spriteTileset, atlas)!.frame
      const art = frames[key]?.frame
      assert.ok(art, key)
      if (source.spriteId === 0x64) assert.ok(art.h <= deck.height && art.h >= deck.height - 4)
      else assert.ok(art.w <= deck.width && art.w > deck.width - 4)
    }
    assert.ok(path.size > 45, room.id + '/' + source.x)
    count++
  }
  assert.equal(count, 25)
})

for (const [roomId, id, x, y, count] of [
  ['00f', 0x63, 304, 384, 150], ['0dd', 0x64, 96, 256, 70], ['00f', 0x64, 3280, 288, 14],
] as const) {
  test('PAL pin coordinates after engagement at ' + roomId + '/' + x, () => {
    const room = campaign.levels[roomId]
    const source = room.sprites.find(s => s.spriteId === id && s.x === x && s.y === y)!
    const state = createGame(campaign), deck = entityFromSpawn(roomId, source, 'tracked')!
    moveEntity({ campaign, state }, deck, state.players.mario)
    deck.owner = 'luigi'
    for (let frame = 0; frame < count; frame++) {
      assert.deepEqual([deck.x + deck.width / 2, deck.y + 8], [x + frame, y])
      const now = palFrame(deck.age)
      while (palFrame(deck.age) === now) moveEntity({ campaign, state }, deck, state.players.mario)
    }
  })
}

test('both players can grab a hanging rope, climb, release and leave the motor running', () => {
  const room = { ...campaign.levels['00f'], spawn: { x: 3274, y: 396 },
    sprites: campaign.levels['00f'].sprites.filter(s => s.x === 3280 && s.spriteId === 0x64),
    tiles: [ ...campaign.levels['00f'].tiles ], exits: [], autoscroll: undefined }
  // Open space under this actual long motor allows a repeatable synchronized jump.
  for (let row = 20; row < room.height; row++) room.tiles.fill(0x25, row * room.width + 196, row * room.width + 213)
  const c = { ...campaign, start: room.id, initial: [room.id], levels: { [room.id]: room } }
  const state = enterFirstCourse(c), step = (mario = 0, luigi = 0) => stepGame(c,state,{mario,luigi})
  delete state.entrance
  const [motor] = state.entities
  for (const p of Object.values(state.players)) Object.assign(p, room.spawn, { vx: 0, vy: 0 })
  step()
  assert.equal(motor.owner, null)
  step(Buttons.up, Buttons.up)
  for (const p of Object.values(state.players)) assert.equal(p.ropeId, motor.id)
  const firstX = state.players.mario.x, firstY = state.players.mario.y
  for (let i = 0; i < 8; i++) step(Buttons.up, 0)
  assert.ok(state.players.mario.x >= firstX + 6)
  assert.ok(state.players.mario.y < firstY - 4)
  assert.equal(state.players.luigi.y, firstY)
  step(Buttons.jump, 0)
  assert.ok(state.players.mario.vy < 0)
  assert.equal(state.players.mario.ropeId, undefined)
  assert.equal(state.players.luigi.ropeId, motor.id)
  step(0, Buttons.jump)
  const releasedX = motor.x
  for (let i = 0; i < 5; i++) step()
  assert.ok(motor.x > releasedX)
  assert.equal(state.players.luigi.ropeId, undefined)
})

test('both Forest platforms follow opposite vertical paths through the PAL counter wrap', () => {
  const room = campaign.levels['122'], state = createGame(campaign), world = { campaign, state }
  const [left, right] = room.sprites.filter(s => s.spriteId === 0xc1)
    .map((s, i) => entityFromSpawn(room.id, s, String(i))!)
  state.entities = [left, right]
  left.owner = 'luigi'
  const samples = new Map<number, [number, number, number, number]>([
    [0, [192,224,272,224]], [254, [319,97,399,351]], [255, [319,97,399,350]],
    [256, [320,98,400,350]], [513,[448,226,528,221]], [577,[480,258,560,189]],
  ])
  for (let tick = 1; tick <= 695; tick++) {
    state.tick = tick
    for (const deck of [left, right]) moveEntity(world, deck, state.players.luigi)
    const expected = samples.get(palFrame(tick))
    if (expected) assert.deepEqual([left.x,left.y,right.x,right.y].map(Math.floor), expected)
  }
})

test('a Hammer Brother stays over the same winged deck in either spawn order', () => {
  const room = campaign.levels['006']
  for (const first of [0x9b, 0x9c]) {
    const x = room.sprites.find(s => s.spriteId === 0x9c)!.x
    const state = createGame(campaign), world = { campaign, state }
    const [rider, deck] = [0x9b, 0x9c].map(id => entityFromSpawn(room.id,
      room.sprites.find(s => s.spriteId === id && s.x === x)!, String(id))!)
    state.entities = first === 0x9b ? [rider,deck] : [deck,rider]
    let px = deck.x, py = deck.y, vx = 0, vy = 0, ax = 1, ay = 2
    for (let t = 1; palFrame(t) <= 260; t++) {
      state.tick = t
      if (palFrame(t) !== palFrame(t - 1)) {
        if (!(palFrame(t) & 1)) {
          vx += ax
          vy += ay
          if (Math.abs(vx) === 32) ax = -ax
          if (Math.abs(vy) === 32) ay = -ay
        }
        px += vx / 16
        py += vy / 16
      }
      for (const e of state.entities) moveEntity(world, e, state.players.luigi)
      assert.deepEqual([deck.x, deck.y, rider.x, rider.y], [px, py, px, py - 16])
    }
  }
})

test('the autonomous brown deck follows the first 500 PAL positions around the Donut Plains 3 curves', () => {
  const room = campaign.levels['005'], state = createGame(campaign)
  const source = room.sprites.find(s => s.spriteId === 0x62)!
  const e = entityFromSpawn(room.id, source, 'curved')!, pins = []
  for (let tick = 1; pins.length < 500; tick++) {
    state.tick = tick
    moveEntity({ campaign, state }, e, state.players.mario)
    if (tick === 1 || palFrame(tick) !== palFrame(tick - 1)) pins.push([e.x+24, e.y+8])
  }
  assert.equal(createHash('sha256').update(JSON.stringify(pins)).digest('hex'),
    '58dea7528cb3d9924855cb2e602cc038df87b8750369116f2f6f4ebd387e1a76')
})
