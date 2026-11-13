import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, createGame, effectiveTile, stepGame, type CampaignDefinition, type GameState } from '@smw/core'
import type { ServerMessage } from '@smw/protocol'
import { openTestRoom } from './coop/socket-room.ts'
import { enterRoom } from '../packages/core/src/state.ts'
import { checkSolidContacts } from './coop/solid-contact.ts'

const rom: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))
const room = rom.levels['134'] // Star World 1
const campaign = { ...rom, start: room.id, initial: [room.id] }
const tile = (state: GameState, col: number, row: number) => effectiveTile(state, room, room.width * row + col)

function enter() {
  const state = createGame(campaign)
  function drive(mario: number, luigi: number, ticks = 1) {
    for (let i = 0; i < ticks; i++) stepGame(campaign, state, { mario, luigi })
  }
  drive(Buttons.action, 0)
  return { state, drive }
}

test('only a powered spin can break the turn blocks underfoot in Star World 1', () => {
  const { state, drive } = enter()
  // Mario collects the mushroom on the entrance ledge. Luigi follows into the slot.
  drive(Buttons.right, 0, 85)
  drive(0, 0, 55)
  drive(0, Buttons.right, 85)
  drive(0, 0, 55)
  const { mario, luigi } = state.players
  assert.deepEqual([mario.form, luigi.form], ['super', 'small'])
  assert.equal(mario.y + mario.height, 160)
  assert.equal(luigi.y + luigi.height, 160)
  drive(Buttons.jump, Buttons.spin)
  assert.ok(!mario.spin && luigi.spin)
  drive(0, 0, 60)
  assert.equal(tile(state, 16, 10), 0x11e)
  assert.ok(mario.grounded && luigi.grounded)

  const score = mario.score
  drive(Buttons.spin, 0)
  for (let i = 0; i < 60 && tile(state, 16, 10) !== 0x25; i++) drive(0, 0)
  assert.equal(tile(state, 16, 10), 0x25)
  assert.equal(tile(state, 16, 11), 0x11e)
  assert.equal(mario.score, score + 50)
  assert.ok(mario.spin && !mario.grounded && mario.vy < 0)
})

test('a spin straddling a seam breaks one block per bounce, starting on the side of the player center', () => {
  for (const [walkingTicks, first, second] of [[78, 15, 16], [80, 16, 15]]) {
    const { state, drive } = enter()
    drive(Buttons.right, 0, walkingTicks)
    drive(0, 0, 55)
    const p = state.players.mario
    assert.equal(Math.floor((p.x + p.width / 2) / 16), first)
    const score = p.score
    drive(Buttons.spin, 0)
    for (let i = 0; i < 60 && tile(state, first, 10) !== 0x25; i++) drive(0, 0)
    assert.equal(tile(state, first, 10), 0x25)
    assert.equal(tile(state, second, 10), 0x11e)
    assert.equal(p.score, score + 50)
    for (let i = 0; i < 45 && tile(state, second, 10) !== 0x25; i++) drive(0, 0)
    assert.equal(tile(state, second, 10), 0x25)
    assert.equal(p.score, score + 100)
  }
})

test('the edge of Mario’s body cannot stop a spin when both feet are in the open shaft', () => {
  const { state, drive } = enter()
  drive(Buttons.right, 0, 76)
  drive(0, 0, 55)
  const p = state.players.mario
  // Center 251, E1 feet 248/254, right edge of the web body 257.
  assert.equal(Math.floor(p.x + p.width / 2), 251)
  drive(Buttons.spin, 0)
  for (let i = 0; i < 100 && tile(state, 15, 11) !== 0x25; i++) {
    drive(0, 0)
    checkSolidContacts(campaign, state)
  }
  assert.equal(tile(state, 15, 11), 0x25)
  assert.equal(tile(state, 16, 10), 0x11e)
  assert.ok(p.spin && !p.grounded)
})

test('a second player spinning over an open block shaft descends past the right wall in Star World 1', () => {
  const { state, drive } = enter()
  const p = state.players.luigi
  // The first player has opened (29,28). Both native foot probes now see air.
  state.tileChanges[room.id] = { [28 * room.width + 29]: 0x25 }
  Object.assign(p, { x: 469.25390625, y: 418, height: 28, form: 'super', spin: true, grounded: false, vy: 3 })
  for (let i = 0; i < 30 && tile(state, 29, 29) !== 0x25; i++) {
    drive(0, 0)
    checkSolidContacts(campaign, state)
  }
  assert.equal(tile(state, 29, 29), 0x25)
  assert.equal(tile(state, 30, 28), 0x11e)
  assert.ok(p.spin && !p.grounded)
})

test('the concrete rim supports Mario while Luigi breaks the cover and enters the pipe in Yoshi’s Island 1', () => {
  const state = createGame(rom)
  state.players.mario.form = 'cape'
  state.players.luigi.form = 'fire'
  stepGame(rom, state, { mario: Buttons.action, luigi: 0 })
  const level = rom.levels['105']
  // The pipe is capped by two turn blocks. Mario's inner foot overlaps the left cap.
  enterRoom({ state, campaign: rom }, state.players.mario, level.id, { x: 1912, y: 292 })
  enterRoom({ state, campaign: rom }, state.players.luigi, level.id, { x: 1930, y: 292 })
  stepGame(rom, state, { mario: 0, luigi: 0 })
  stepGame(rom, state, { mario: Buttons.spin, luigi: Buttons.spin })
  for (let i = 0; i < 100; i++) stepGame(rom, state, { mario: 0, luigi: 0 })
  assert.equal(state.players.mario.score, 0)
  assert.equal(state.players.mario.y + state.players.mario.height, 320)
  assert.equal(state.players.luigi.score, 100)
  assert.equal(state.players.luigi.y + state.players.luigi.height, 352)
  stepGame(rom, state, { mario: 0, luigi: Buttons.down })
  assert.equal(state.players.luigi.roomId, '1cb')
  assert.equal(state.players.mario.roomId, level.id)
})

test('both clients see Luigi drill through nine rows with one spin, then land on rock', async t => {
  const session = await openTestRoom(campaign)
  t.after(() => session.close())
  const lastSnapshot: (GameState | undefined)[] = []
  const shatters = [0, 0]
  for (const [i, seat] of [session.mario, session.luigi].entries()) {
    seat.socket.on('message', raw => {
      const message: ServerMessage = JSON.parse(raw.toString())
      if (message.type === 'snapshot') lastSnapshot[i] = message.state
      if (message.type === 'gameEvent' && message.event.type === 'shatter' && message.event.playerId === 'luigi') shatters[i]++
    })
  }
  await session.drive(Buttons.action, 0)
  await session.drive(0, Buttons.right, 85)
  await session.drive(0, 0, 55)
  const score = session.state.players.luigi.score
  assert.equal(session.state.players.luigi.form, 'super')
  await session.drive(0, Buttons.spin)
  await session.drive(0, 0, 240)
  await Promise.all([session.mario.flush(), session.luigi.flush()])
  assert.deepEqual(shatters, [9, 9])
  for (const state of lastSnapshot) {
    assert.ok(state)
    for (let row = 10; row <= 18; row++) {
      assert.equal(tile(state, 16, row), 0x25)
      assert.equal(tile(state, 15, row), 0x11e)
      assert.equal(tile(state, 17, row), 0x11e)
    }
    const { luigi } = state.players
    assert.equal(luigi.score, score + 450)
    assert.equal(luigi.y + luigi.height, 384)
    assert.ok(luigi.grounded && !luigi.spin)
  }
})

test('holding A changes the height of the rebound between breakable rows as in E1', () => {
  // The PAL input trace measures 10 px released and 22 px held from impact to apex.
  for (const [hold, expectedRise] of [[0, 10], [Buttons.spin, 22]]) {
    const { state, drive } = enter()
    drive(0, Buttons.right, 85)
    drive(0, 0, 55)
    drive(0, Buttons.spin)
    const p = state.players.luigi
    let impact: number | undefined
    let apex = Infinity
    for (let t = 0; t < 100; t++) {
      drive(0, hold)
      const feet = p.y + p.height
      if (state.events.some(e => e.type === 'shatter')) {
        if (impact !== undefined) break
        impact = feet
      }
      if (impact !== undefined) apex = Math.min(apex, feet)
    }
    assert.equal(tile(state, 16, 11), 0x25)
    assert.ok(impact !== undefined && Math.abs(impact - apex - expectedRise) <= 1)
  }
})

test('a broken turn block reloads only on a new visit with no teammate in the room', () => {
  const { state, drive } = enter()
  const world = { campaign, state }, { mario, luigi } = state.players
  drive(0, Buttons.right, 85)
  drive(0, 0, 55)
  drive(0, Buttons.spin)
  drive(0, 0, 28)
  assert.equal(tile(state, 16, 10), 0x25)
  enterRoom(world, luigi, '1cb')
  enterRoom(world, luigi, room.id)
  assert.equal(tile(state, 16, 10), 0x25)
  enterRoom(world, mario, '1cb')
  enterRoom(world, luigi, '1cb')
  enterRoom(world, mario, room.id)
  assert.equal(tile(state, 16, 10), 0x11e)
})
