import assert from 'node:assert/strict'
import test from 'node:test'
import { Buttons, stepGame, type CampaignDefinition, type PowerForm } from '../src/index.ts'
import { enterFirstCourse } from './enter-first-course.ts'
import { playerContactBody } from '../src/player-size.ts'
import { isBodyFree } from '../src/terrain.ts'
import { spawnEntity } from '../src/state.ts'
import { contact } from '../src/entity-contact.ts'

function course(form: PowerForm = 'super') {
  const width = 24, height = 12
  const room = { id: 'duck', width, height, spawn: { x: 32, y: 112 }, exits: [], sprites: [],
    tiles: Array<number>(width * height).fill(0x25), layer2: Array<number>(width * height).fill(0x25) }
  room.tiles.fill(0x130, 10 * width)
  const campaign: CampaignDefinition = { start: room.id, levels: { duck: room }, routes: { duck: {} } }
  const state = enterFirstCourse(campaign)
  for (const p of Object.values(state.players)) Object.assign(p, { form, height: form === 'small' ? 16 : 28,
    y: 160 - (form === 'small' ? 16 : 28), grounded: true })
  return { room, state, campaign, mario: state.players.mario, luigi: state.players.luigi }
}

test('Down applies the PAL crouch on the next frame in every form and stays latched throughout a jump', () => {
  for (const form of ['small', 'super', 'cape', 'fire'] as const) {
    const { state, campaign, mario, luigi } = course(form)
    stepGame(campaign, state, { mario: Buttons.down | Buttons.right, luigi: 0 })
    assert.equal(mario.ducking, true)
    assert.equal(!!luigi.ducking, false)
    assert.equal(mario.height, 16)
    assert.equal(mario.y + mario.height, 160)
    assert.equal(playerContactBody(mario).height, 12)
    assert.equal(mario.x, 32)
    stepGame(campaign, state, { mario: Buttons.down | Buttons.jump, luigi: 0 })
    for (let i = 0; i < 5; i++) stepGame(campaign, state, { mario: 0, luigi: 0 })
    assert.ok(!mario.grounded && mario.ducking)
    for (let i = 0; i < 100; i++) stepGame(campaign, state, { mario: 0, luigi: 0 })
    assert.ok(mario.grounded && !mario.ducking)
    assert.equal(mario.height, form === 'small' ? 16 : 28)
  }
})

test('a high projectile clears the crouched character while hitting the standing partner', () => {
  const world = course()
  const { mario, luigi, state, campaign } = world
  stepGame(campaign, state, { mario: 0, luigi: Buttons.down })
  const shot = spawnEntity(world, 'duck', { x: mario.x, y: 140, spriteId: 0x46 }, 'chuckShot')!
  shot.height = 5
  for (const p of [mario, luigi]) contact(world, shot, p, 0, p.y + p.height)
  assert.equal(luigi.form, 'super')
  assert.equal(mario.form, 'small')
})

test('momentum takes a crouched player under either layer and standing waits for clearance', () => {
  for (const layer of ['tiles', 'layer2'] as const) {
    const world = course()
    const { campaign, state, room, mario } = world
    room[layer][8 * room.width + 3] = 0x130
    mario.vx = 2.5
    while (mario.x < 45) stepGame(campaign, state, { mario: Buttons.down, luigi: 0 })
    assert.equal(mario.ducking, true)
    for (let i = 0; i < 50; i++) {
      stepGame(campaign, state, { mario: Buttons.right, luigi: 0 })
      assert.ok(isBodyFree(world, room, mario))
    }
    assert.ok(mario.x >= 64 && !mario.ducking)
    assert.equal(mario.y + mario.height, 160)
  }
})

test('the mounted crouch uses the shorter Yoshi sprite contact box and keeps the mount', () => {
  const { campaign, state, mario } = course()
  mario.mounted = true
  stepGame(campaign, state, { mario: Buttons.down, luigi: 0 })
  assert.ok(mario.ducking && mario.mounted)
  assert.equal(mario.height, 25)
  assert.equal(playerContactBody(mario).height, 24)
  assert.equal(mario.y + mario.height, 160)
})

test('a spin jump on land and a swimming stroke from the bottom both release the crouch', () => {
  for (const swim of [false, true]) {
    const { campaign, state, mario } = course()
    campaign.levels.duck.water = swim
    stepGame(campaign, state, { mario: Buttons.down, luigi: 0 })
    assert.ok(mario.ducking)
    stepGame(campaign, state, { mario: Buttons.down | (swim ? Buttons.jump : Buttons.spin), luigi: 0 })
    assert.ok(!mario.ducking && !mario.grounded)
    assert.equal(mario.height, 28)
  }
})
