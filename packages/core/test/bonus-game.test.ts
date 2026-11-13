import { enterFirstCourse } from './enter-first-course.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  createGame,
  stepGame,
  makeSave,
  validateSave,
  Buttons,
  type CampaignDefinition,
} from '../src/index.ts'
import { resolveBonus } from '../src/bonus-game.ts'

const file = new URL('../../../generated/content.json', import.meta.url)
const rom: CampaignDefinition | undefined = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : undefined
const extracted = { skip: !rom && 'Prepare PAL E1 with npm run extract' }
function enterViaTape(id: string) {
  const campaign = { ...rom!, start: id, initial: [id] }
  const state = enterFirstCourse(campaign)
  const tape = state.entities.find((e) => e.kind === 'goal')!
  Object.assign(state.players.mario, { x: tape.x, y: tape.origin.y, bonusStars: 99 })
  stepGame(campaign, state, { mario: 0, luigi: 0 })
  assert.ok(state.goalWalk)
  for (let t = 0; state.goalWalk && t < 700; t++) stepGame(campaign, state, { mario: 0, luigi: 0 })
  assert.ok(state.bonus)
  return { state, campaign }
}
test('the course timer cannot kill the team inside the post-goal bonus game', extracted, () => {
  const { campaign, state } = enterViaTape('015')
  state.timeLeft = 1
  for (let frame = 0; frame < 82; frame++) stepGame(campaign, state, { mario: 0, luigi: 0 })
  assert.ok(state.bonus)
  assert.equal(state.timeLeft, 1)
  assert.ok(Object.values(state.players).every((p) => p.status === 'alive' && p.lives === 5))
  assert.ok(validateSave(campaign, makeSave(state)))
})
test(
  'crossing 100 on the tape consumes the stars once, unlocks the route, and selects the proper bonus bank',
  extracted,
  () => {
    for (const [id, bonus] of [
      ['105', '100'],
      ['015', '000'],
    ]) {
      const { state, campaign } = enterViaTape(id)
      assert.equal(state.bonus?.roomId, bonus)
      assert.equal(state.players.mario.bonusStars, 0)
      assert.ok(state.progress.completed.includes(id + ':normal'))
      assert.equal(state.players.luigi.roomId, bonus)
      assert.equal(state.bonus?.slots.filter((s) => s.stopped).length, 1)
      const save = makeSave(state)
      assert.ok(validateSave(campaign, save))
      const resumed = createGame(campaign, save)
      assert.deepEqual(resumed.bonus, state.bonus)
      assert.equal(resumed.players.mario.bonusStars, 0)
    }
  },
)
test(
  'controller jumps stop eight independent symbols, award collectible lives, and return to the unlocked map',
  extracted,
  () => {
    const { campaign, state } = enterViaTape('105')
    const p = state.players.mario
    let stopped = 1,
      result: number | null = null,
      wins = 0
    const original = state.bonus!.slots.map((s) => s.frame)
    for (let t = 0; t < 3000 && state.bonus; t++) {
      const buttons =
        (p.x < 110 ? Buttons.right : p.x > 114 ? Buttons.left : 0) |
        (result === null && (p.grounded || p.vy < 0) ? Buttons.jump : 0)
      stepGame(campaign, state, { mario: buttons, luigi: 0 })
      if (!state.bonus) break
      const count = state.bonus.slots.filter((s) => s.stopped).length
      assert.ok(count >= stopped && count <= stopped + 1)
      stopped = count
      if (t === 30)
        assert.notDeepEqual(
          state.bonus.slots.map((s) => s.frame),
          original,
        )
      if (state.bonus.result !== null) {
        result = state.bonus.result
        wins = Math.max(wins, state.bonus.remaining)
      }
    }
    assert.equal(stopped, 9)
    assert.notEqual(result, null)
    assert.equal(state.phase, 'map')
    assert.equal(state.players.mario.lives + state.players.luigi.lives, 10 + wins)
    assert.ok(state.progress.unlocked.includes('014'))
  },
)
test(
  'a uniform board scores all eight independent lines and awards remaining lives exactly once across saves',
  extracted,
  () => {
    const { state, campaign } = enterViaTape('015')
    const bonus = state.bonus!
    for (const slot of bonus.slots) {
      slot.frame = 4
      slot.symbol = 1
      slot.stopped = true
    }
    resolveBonus(bonus)
    assert.equal(bonus.result, 8)
    assert.ok(bonus.slots.every((s) => s.winning))
    assert.ok(validateSave(campaign, makeSave(state)))
    for (let tick = 0; tick < 500 && state.bonus?.remaining === 8; tick++)
      stepGame(campaign, state, { mario: 0, luigi: 0 })
    assert.ok(bonus.remaining < 8)
    const snapshot = makeSave(state),
      restored = createGame(campaign, snapshot)
    assert.equal(restored.bonus!.remaining, bonus.remaining)
    for (let tick = 0; tick < 3500 && restored.bonus; tick++)
      stepGame(campaign, restored, { mario: 0, luigi: 0 })
    assert.equal(restored.phase, 'map')
    assert.equal(restored.players.mario.lives + restored.players.luigi.lives, 18)
  },
)
