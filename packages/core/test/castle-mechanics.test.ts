import { enterFirstCourse } from './enter-first-course.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { type CampaignDefinition } from '../src/index.ts'
import { enterRoom, spawnEntity } from '../src/state.ts'
import { effectiveTile, isSolid, moveBody } from '../src/terrain.ts'
import { stepLayer } from '../src/layer-two.ts'
import { contact } from '../src/entity-contact.ts'
import { castMagic, moveMagic } from '../src/magikoopa.ts'
import { movePipeBoss } from '../src/pipe-boss.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync(
  new URL('../../../generated/content.json', import.meta.url), 'utf8',
))

test('castle oscillators use their native initial offset and repeat while both players climb', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }
  const team = Object.values(state.players)
  for (const [id, initial, min, max] of [['0d4', 192, 16, 193], ['0e7', 0, -128, 1]] as const) {
    const room = campaign.levels[id]
    const path = room.layerOscillation!
    team.forEach(p => enterRoom(world, p, id, { x: 32, y: 80 }))
    assert.equal(path.samples[0], initial)
    assert.equal(Math.min(...path.samples), min)
    assert.equal(Math.max(...path.samples), max)
    const loop = path.samples.length - path.start
    for (let tick = 0; tick <= 3 * path.samples.length; tick++) {
      stepLayer(world, room, team)
      const phase = Math.floor(tick * 50 / 60)
      const index = phase < path.start ? phase : path.start + (phase - path.start) % loop
      assert.equal(state.layerOffsets[id][path.axis], path.samples[index])
    }
  }
})

test('Donut Plains 2 moves both riders with the PAL autoscroll terrain and seeks without pushing', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }
  const room = campaign.levels['009'], team = Object.values(state.players)
  const path = room.layerScrollPath!
  assert.deepEqual([0, 600, 1200, 1808, 2400, 4236, 7299].map(frame => path[frame][1]),
    [0, 8, -84, -101, 57, 66, 34])
  const tick = 3780, floor = 14 * 16
  team.forEach((p, i) => {
    enterRoom(world, p, room.id)
    p.scrollClock = tick
    p.x = (90 + i) * 16
    p.y = floor + path[tick * 5 / 6][1] - p.height
    p.layer2Ground = p.grounded = true
  })
  // Mario re-entered earlier along the moving camera. Luigi keeps the room's
  // current phase while both stand on adjacent cells of the same platform.
  team[0].scrollClock! -= 120
  for (let i = 0; i < 420; i++) {
    stepLayer(world, room, team)
    const layer = state.layerOffsets[room.id]
    assert.equal(layer.y, path[Math.floor((tick + i) * 5 / 6)][1])
    if (!i) assert.equal(layer.dy, 0)
    for (const p of team) {
      p.vy = 0.25
      moveBody(world, room, p)
      assert.ok(p.layer2Ground)
      assert.equal(p.y + p.height, floor + layer.y)
      p.scrollClock!++
    }
  }
  team.forEach(p => { p.scrollClock = 0 })
  stepLayer(world, room, team)
  assert.equal(state.layerOffsets[room.id].y, 0)
  assert.equal(state.layerOffsets[room.id].dy, 0)
})

test('the wand removes one struck turn block and creates one shared sprite', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }
  const room = campaign.levels['1fe'], col = 45, row = 23
  const tile = row * room.width + col
  assert.equal(room.tiles[tile], 0x11e)
  const spell = spawnEntity(world, room.id, { x: col * 16 - 5, y: row * 16, spriteId: 0x20 })!
  spell.width = spell.height = 8
  spell.vx = 2
  const before = state.entities.length
  moveMagic(world, room, spell)
  assert.equal(spell.active, false)
  assert.equal(effectiveTile(state, room, tile), 0x25)
  assert.equal(state.entities.length, before + 1)
})

test('Lemmy and Wendy emerge from the room pipes with two solid-looking doubles', () => {
  for (const id of ['1f2', '0d3']) {
    const state = enterFirstCourse(campaign), world = { campaign, state }, room = campaign.levels[id]
    enterRoom(world, state.players.mario, id)
    const boss = state.entities.find(e => e.kind === 'boss')!
    boss.age = 1
    movePipeBoss(world, room, boss)
    const cast = state.entities.filter(e => e.kind === 'boss' || e.kind === 'pipeDecoy')
    assert.equal(cast.length, 3)
    cast.forEach(e => {
      e.age = 250
      movePipeBoss(world, room, e)
      assert.equal(e.height, 32)
      const rim = Math.floor((e.y + e.height) / 16) * room.width + Math.floor(e.x / 16)
      assert.equal(room.tiles[rim], 0x133)
    })
    assert.equal(new Set(cast.map(e => e.x)).size, 3)
  }
})

test('the Mode 7 floor under Roy stays solid during a carried-over P-switch', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }, arena = campaign.levels['0cc']
  state.pSwitch = 300
  enterRoom(world, state.players.luigi, arena.id)
  for (let col = 0; col < arena.width; col++)
    assert.ok(isSolid(effectiveTile(state, arena, 11 * arena.width + col)))
})


test('invincibility leaves Magikoopa available to reopen the Valley castle corridor', () => {
  const state = enterFirstCourse(campaign), world = { campaign, state }, player = state.players.luigi
  enterRoom(world, player, '1fe')
  const wizard = state.entities.find(e => e.kind === 'magikoopa')!
  player.star = 1
  Object.assign(player, { x: wizard.x, y: wizard.y })
  contact(world, wizard, player, 0, player.y + player.height)
  assert.ok(wizard.active)
  assert.equal(wizard.height, 0)
  wizard.age = wizard.stunnedUntil!
  castMagic(world, wizard, player)
  assert.equal(wizard.height, 16)
})
