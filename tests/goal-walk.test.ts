import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Buttons, createGame, goalWalkFrame, makeSave, palFrame, stepGame, type CampaignDefinition, type PlayerId } from '@smw/core'
import { startCourse } from '../packages/core/src/campaign.ts'
import { spawnEntity } from '../packages/core/src/state.ts'
import { goalCoinHud, settleGoalCoins } from '../packages/core/src/goal-coins.ts'
import { contact } from '../packages/core/src/entity-contact.ts'
import { playerAppearance } from '../apps/web/src/game/player-effects.ts'
import { Playback } from '../apps/web/src/game/playback.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))
const released = { mario: 0, luigi: 0 }

function atTape(finisher: PlayerId, mounted: boolean, bonusStars = 0) {
  const state = createGame(campaign), world = { campaign, state }
  startCourse(world, '105')
  const goal = state.entities.find(e => e.kind === 'goal')!
  assert.ok(goal)
  const p = state.players[finisher]
  Object.assign(p, { x: goal.x, y: goal.origin.y - 8, mounted, bonusStars, grounded: true })
  contact(world, goal, p, 0, p.y + p.height)
  return state
}

test('a real tape commits the exit once, walks through the held salute and iris, and rejoins the map', () => {
  for (const seat of ['mario', 'luigi'] as const) for (const mounted of [false, true]) {
    const state = atTape(seat, mounted), walk = state.goalWalk!
    assert.equal(walk.finisher, seat)
    assert.equal(state.phase, 'map')
    assert.deepEqual(state.progress.completed, ['105:normal'])
    const save = makeSave(state), p = state.players[seat], x = p.x
    const offline = createGame(campaign, save)
    assert.equal(offline.phase, 'map')
    assert.equal(offline.goalWalk, undefined)
    const online = new Playback(campaign, seat, () => true)
    for (let i = 0; i < 660 && state.goalWalk; i++) {
      stepGame(campaign, state, released)
      if (palFrame(state.tick) === 120) assert.ok(Math.abs(p.x - x - 37) < 1.5)
      const phase = goalWalkFrame(walk, state.tick)
      if (state.goalWalk) assert.equal(state.mapReveal?.start, undefined)
      if (phase.age === 380 && !online.state) {
        assert.equal(playerAppearance(p, state.tick, walk).frame, seat + '/small/' + (mounted ? 20 : 38))
        online.receive(JSON.parse(JSON.stringify(state)), 0)
        assert.deepEqual(online.displayState?.goalWalk, walk)
        online.update(0)
        assert.equal(online.displayState?.tick, state.tick + 1)
      }
      if (phase.age === 490) assert.ok(phase.iris! < 240 && phase.iris! > 0)
    }
    assert.equal(state.goalWalk, undefined)
    assert.equal(state.mapReveal?.start, state.tick)
    assert.deepEqual(state.progress.completed, ['105:normal'])
    assert.deepEqual(makeSave(state).resources, save.resources)
  }
})

test('the 100th star earns a resumable bonus and the live players enter it after the iris', () => {
  const state = atTape('luigi', true, 99), walk = state.goalWalk
  assert.ok(walk)
  assert.equal(walk.stars, 1)
  const saved = makeSave(state), resumed = createGame(campaign, saved)
  assert.equal(resumed.bonus?.owner, 'luigi')
  assert.deepEqual(resumed.progress.completed, ['105:normal'])
  let sawIris = false
  for (let i = 0; i < 720 && state.goalWalk; i++) {
    assert.equal(state.bonus, undefined)
    assert.equal(state.players.luigi.roomId, '105')
    sawIris ||= (goalWalkFrame(walk, state.tick).iris ?? 256) < 128
    stepGame(campaign, state, { mario: Buttons.action, luigi: Buttons.spin })
  }
  assert.equal(sawIris, true)
  assert.equal(state.goalWalk, undefined)
  assert.equal(state.bonus?.owner, 'luigi')
  assert.equal(state.players.luigi.roomId, resumed.players.luigi.roomId)
  assert.equal(state.players.luigi.bonusStars, 0)
  assert.deepEqual(makeSave(state), saved)
})

test('the native HUD and goal stripe count independently without mutating the credited score', async () => {
  const { goalCounters } = await import('../apps/web/src/game/course-clear.ts')
  const { goalFadePhase } = await import('../apps/web/src/game/goal-fade.ts')
  const walk = { ...atTape('luigi', false).goalWalk!, scoreBefore: 3400, stars: 21, coins: undefined }
  assert.deepEqual(goalCounters(walk, 282, 299), { remaining: 14950, score: 3400, stars: 21, hudStars: 21 })
  assert.deepEqual(goalCounters(walk, 284, 299), { remaining: 14750, score: 3500, stars: 20, hudStars: 21 })
  assert.deepEqual(goalCounters(walk, 399, 299), { remaining: 3250, score: 15000, stars: 0, hudStars: 0 })
  assert.deepEqual(goalCounters({ ...walk, stars: 0 }, 397, 299), { remaining: 0, score: 18350, stars: 0, hudStars: 0 })
  assert.equal(goalCounters({ ...walk, scoreBefore: 9999980 }, 399, 299).score, 9999990)
  assert.equal(goalFadePhase(walk, 180), 32)
  assert.equal(goalWalkFrame(walk, 612).iris, 84)
})

test('105 loads the real Chuck and tape, converts both on a missed ribbon and retains the committed money', () => {
  const state = createGame(campaign), world = { campaign, state }
  startCourse(world, '105')
  const tape = state.entities.find(e => e.kind === 'goal')!, chuck = state.entities.find(e => e.spriteId === 0x95 && e.x === 4768)!
  const p = state.players.luigi, initialLives = p.lives
  Object.assign(p, { x: tape.x, y: tape.y - 35, coins: 99, grounded: true })
  const mushroom = spawnEntity(world, '105', { x: 4800, y: tape.y, spriteId: 0x74 })!
  const yoshi = spawnEntity(world, '105', { x: 4780, y: tape.y, spriteId: 0x35 })!
  const offscreen = spawnEntity(world, '105', { x: 4520, y: tape.y, spriteId: 0x05 })!
  contact(world, tape, p, 0, p.y+p.height)
  for (const e of [tape, chuck, mushroom, offscreen]) assert.equal(e.active, false)
  assert.equal(yoshi.active, true)
  const bonus = state.goalWalk!.coins!
  assert.equal(state.goalWalk!.stars, 0)
  assert.deepEqual(bonus.popups.map(e => e.type).sort(), [5,7])
  assert.deepEqual([bonus.sprites.length, bonus.scoreGain, p.coins, p.lives], [2,500,1,initialLives + 1])
  assert.equal(goalCoinHud(bonus,55).coins,99)
  assert.equal(goalCoinHud(bonus,56).coins,0)
  assert.equal(p.score, 500 + state.timeLeft*50)
  const saved = makeSave(state)
  contact(world,tape,p,0,p.y+p.height)
  while (state.goalWalk) stepGame(campaign,state,released)
  assert.deepEqual(makeSave(state).resources,saved.resources)
})

test('simultaneous goal coins recycle the same six native award slots', () => {
  for (const [n, coins, points, extraLives] of [[1,1,100,0],[3,3,1500,0],[5,5,5500,1],[8,23,15240,4],[10,45,15360,4]]) {
    const state = createGame(campaign), world = { campaign, state }
    startCourse(world, '105')
    const tape = state.entities.find(e => e.kind === 'goal')!, p = state.players.mario
    state.entities = [tape]
    Object.assign(p, { x: tape.x, y: tape.y })
    for (let i=0;i<n;i++) spawnEntity(world,'105',{ x: tape.x-64+8*i, y: tape.y, spriteId: 4 })
    const initialLives = p.lives
    const converted = settleGoalCoins(world,p,tape,true)!
    assert.equal(converted.sprites.length,n)
    assert.equal(converted.popups.length,Math.min(n,6))
    assert.deepEqual([p.coins,p.score,p.lives-initialLives],[coins,points,extraLives])
    assert.deepEqual(goalCoinHud(converted,225),{coins,lives:initialLives+extraLives})
  }
})
