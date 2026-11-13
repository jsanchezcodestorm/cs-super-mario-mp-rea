import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, goalWalkFrame, makeSave, type CampaignDefinition, type GameState } from '@smw/core'
import type { ServerMessage } from '@smw/protocol'
import { Playback } from '../apps/web/src/game/playback.ts'
import { LocalGameSession } from '../apps/web/src/session/local-game.ts'
import { enterFirstCourse } from '../packages/core/test/enter-first-course.ts'
import { recordings } from './coop/inputs.ts'
import { openTestRoom } from './coop/socket-room.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))

test('solo and both WebSocket clients see the whole Yoshi’s Island 1 finish while either controller keeps playing', async t => {
  const entry = makeSave(enterFirstCourse(campaign))
  const session = await openTestRoom(campaign, entry)
  t.after(() => session.close())
  const peers = [session.mario, session.luigi]
  const latest: GameState[] = []
  for (const [i, peer] of peers.entries()) {
    peer.socket.on('message', raw => {
      const message: ServerMessage = JSON.parse(raw.toString())
      if (message.type === 'snapshot') latest[i] = message.state
    })
  }
  const solo = new LocalGameSession(campaign, entry, { step() {}, save() {} })
  async function drive(mario: number, luigi: number, ticks: number) {
    await session.drive(mario, luigi, ticks)
    for (let i = 0; i < ticks; i++) solo.update(mario)
  }
  async function screens() {
    await Promise.all(peers.map(peer => peer.flush()))
    assert.equal(latest.length, 2)
    return [...latest, solo.displayState]
  }
  const route = recordings()['105:normal']
  assert.ok(Array.isArray(route))
  for (const [mario, luigi, ticks] of route) await drive(mario, luigi, ticks)
  const crossing = session.state.goalWalk?.tick
  assert.ok(crossing !== undefined)
  for (const state of await screens()) {
    assert.equal(state.goalWalk?.finisher, 'mario')
    assert.ok(Math.abs(state.tick - crossing) <= 1)
    assert.equal(state.goalWalk.tick, crossing)
  }

  // Both controllers have right/run held at the ribbon. Jump, spin and even
  // a partner pressing Enter used to send the display straight to the map.
  await drive(Buttons.right | Buttons.run | Buttons.jump, Buttons.action | Buttons.spin, 8)
  for (const state of await screens()) {
    assert.equal(state.goalWalk?.tick, crossing)
    assert.equal(state.mapPlayers.mario.travel?.elapsed ?? 0, 0)
    assert.equal(state.mapReveal?.start, undefined)
  }
  const held = Buttons.down | Buttons.run
  await drive(held, held, 448)
  for (const state of await screens()) {
    assert.ok(state.goalWalk)
    assert.equal(goalWalkFrame(state.goalWalk, state.tick).salute, true)
  }
  await drive(held, held, 144)
  const irisScreens = await screens()
  for (const state of irisScreens) {
    assert.ok(state.goalWalk)
    const { iris } = goalWalkFrame(state.goalWalk, state.tick)
    assert.ok(iris !== undefined && iris > 0 && iris < 240)
  }
  // Both browsers can have inputs in flight beyond the last frame confirmed
  // by the server. Their prediction should reach black and hold it there.
  const clients = (['mario', 'luigi'] as const).map((seat, i) => {
    const client = new Playback(campaign, seat, () => true)
    const snapshot = irisScreens[i]
    client.receive(snapshot, 0)
    for (let n = 0; n < 68; n++) client.update(held)
    const shown = client.displayState!
    assert.ok(shown.tick > snapshot.tick)
    assert.ok(shown.goalWalk)
    assert.equal(goalWalkFrame(shown.goalWalk, shown.tick).iris, 0)
    return client
  })

  // 105 automatically leads to 014. Holding Down through both animations
  // must not send the players back to 105 as soon as they arrive.
  await drive(held, held, 650)
  const mapScreens = await screens()
  for (const state of mapScreens) {
    assert.equal(state.goalWalk, undefined)
    assert.equal(state.phase, 'map')
    assert.equal(state.progress.unlocked[state.progress.selection], '014')
    assert.equal(state.mapPlayers.mario.travel, undefined)
    assert.deepEqual(state.progress.completed, ['105:normal'])
  }
  for (const [i, client] of clients.entries()) {
    client.receive(mapScreens[i], 68)
    assert.equal(client.displayState?.goalWalk, undefined)
  }
  assert.deepEqual(session.mario.exits, ['mario:normal'])
  assert.deepEqual(session.luigi.exits, session.mario.exits)
  assert.deepEqual(session.luigi.save, session.mario.save)
  await drive(0, 0, 2)
  await drive(Buttons.down, Buttons.down, 2)
  for (const state of await screens()) assert.equal(state.mapPlayers.mario.travel?.to, '105')
})
