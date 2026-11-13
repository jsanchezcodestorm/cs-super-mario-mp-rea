import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, createGame, makeSave, orbFinishFrame, stepGame, type CampaignDefinition } from '@smw/core'
import { startCourse } from '../packages/core/src/campaign.ts'
import { enterRoom } from '../packages/core/src/state.ts'

const rom: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))
const campaign = { ...rom, start: '018', initial: ['018'] }

test('the Ship sphere freezes the winner through the tally and 30-frame fade before the map reveal', () => {
  for (const finisher of ['mario', 'luigi'] as const) {
    const state = createGame(campaign), world = { campaign, state }
    startCourse(world, '018')
    const winner = state.players[finisher]
    enterRoom(world, winner, '0f7')
    const orb = state.entities.find(e => e.roomId === '0f7' && e.kind === 'orb')!
    assert.deepEqual([orb.x, orb.y], [352, 6208])
    state.timeLeft = 299
    Object.assign(winner, { x: orb.x, y: orb.y - 7 })
    stepGame(campaign, state, { mario: 0, luigi: 0 })
    const finish = state.orbFinish
    assert.ok(finish)
    assert.equal(finish.finisher, finisher)
    assert.deepEqual(state.progress.completed, ['018:normal'])
    assert.equal(state.events.filter(e => e.type === 'exit' && e.courseClear).length, 1)
    assert.equal(orb.active, false)
    assert.equal(makeSave(state).resources[finisher].score, 14950)
    const trace = new Map([[351, 15], [352, 15], [354, 14], [380, 1], [382, 0]])
    const observed = new Map<number, number>()
    const start = [winner.x, winner.y]
    for (let i = 0; i < 480 && state.orbFinish; i++) {
      stepGame(campaign, state, { mario: i % 2 ? Buttons.action : Buttons.right, luigi: i % 2 ? Buttons.left : Buttons.jump })
      const frame = orbFinishFrame(finish, state.tick)
      if (trace.has(frame.age)) observed.set(frame.age, frame.brightness)
      assert.deepEqual([winner.x, winner.y], start)
      if (!frame.finished) assert.equal(state.mapReveal?.start, undefined)
    }
    assert.deepEqual(observed, trace)
    assert.equal(state.orbFinish, undefined)
    assert.equal(state.mapReveal?.start, state.tick)
  }
})
