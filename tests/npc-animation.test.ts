import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createGame, palFrame, type EntityState } from '@smw/core'
import type { Content } from '../apps/web/src/game/content.ts'
import { frameForEntity, mirrorEntity } from '../apps/web/src/game/actors-view.ts'
import { stepEmitters } from '../packages/core/src/emitters.ts'
import { moveEntity } from '../packages/core/src/entity-motion.ts'
import { entityFromSpawn } from '../packages/core/src/species.ts'
import { stepLevelNpc } from '../packages/core/src/level-npcs.ts'

const campaign: Content = JSON.parse(readFileSync('generated/content.json', 'utf8'))
const art = JSON.parse(readFileSync('generated/creatures-registration.json', 'utf8'))
const atlas = { has: (key: string) => Object.hasOwn(art, key) }
const graphic = (e: EntityState, tick: number, set: number) => frameForEntity(e, tick, set, atlas)?.frame

test('every placed resident, ghost, Koopa and Chuck can draw every live pose it reaches in its tileset', () => {
  const checked = new Set<string>()
  for (const room of Object.values(campaign.levels)) {
    for (const spawn of room.sprites) {
      const e = entityFromSpawn(room.id, spawn, 'test')
      if (!e || !['levelNpc','boo','netKoopa','chuck','koopa','lakitu'].includes(e.kind)) continue
      const key = [room.spriteTileset, e.spriteId, (e.origin.x >> 4) & 3].join('/')
      if (checked.has(key)) continue
      checked.add(key)
      const state = createGame(campaign), world = { campaign, state }
      const p = state.players.luigi
      Object.assign(p, { roomId: room.id, y: e.y, facing: 1 })
      for (let t = 1; t <= 420 && e.active; t++) {
        state.tick = t
        p.x = e.x + ((t % 128 < 64) ? -100 : 100)
        moveEntity(world, e, p)
        if (!e.active || (e.spriteId === 0xa8 && !e.resident!.phase)) continue
        const name = graphic(e, t, room.spriteTileset)
        assert.ok(name && atlas.has(name), key + ' ' + name)
        assert.equal(mirrorEntity(e), false)
      }
    }
  }
  assert.ok(checked.size >= 100)
})

test('pipe Lakitu exposes its head, turns, releases a Spiny egg and retracts on the PAL timers', () => {
  const room = campaign.levels['11f']
  for (const silver of [0, 20]) {
    const state = createGame(campaign), world = { state, campaign }
    state.silverSwitch = silver
    const spawn = room.sprites.find(s => s.spriteId === 0x4b)!
    const e = entityFromSpawn(room.id,spawn,'lakitu')!
    const p = state.players.mario
    p.x = e.x-50
    const phases = []
    let last = 0
    for (let tick = 1; tick <= 390; tick++) {
      state.tick = tick
      stepLevelNpc(world,e,p)
      if (last !== e.resident!.phase) {
        last = e.resident!.phase
        phases.push([palFrame(tick), last, e.resident!.timer])
      }
    }
    assert.deepEqual(phases, [[1,1,144],[145,2,12],[157,3,128],[285,4,32],[317,0,80]])
    const shot = state.entities.at(-1)!
    assert.equal(shot.spriteId, silver ? 0x21 : 0x14)
    assert.equal(shot.vx,-1)
    assert.equal(shot.vy,-2.5)
    assert.ok(atlas.has(graphic(shot,state.tick,room.spriteTileset)!))
  }
})

test('the blue shell-less Koopa braces, kicks for 25 PAL frames, and puts its foot down', () => {
  const e = entityFromSpawn('106', { spriteId:2, x:32, y:80 }, 'blue')!
  const set = Object.values(campaign.levels).find(room => room.sprites.some(s=>s.spriteId===2))!.spriteTileset
  for (const facing of [-1,1] as const) {
    e.facing = facing
    e.shellDefense = { id:'shell', facing, wait:43 }
    e.koopa = { phase:15, turn:0 }
    const normal = set+'-2'+(facing===1?':right/0':'/0')
    assert.equal(graphic(e,42,set),normal)
    delete e.shellDefense
    e.shellKickTick = 60
    for (let t = 60; t < 99; t++) {
      const elapsed = palFrame(t)-palFrame(60)
      const name = graphic(e,t,set)
      assert.ok(atlas.has(name!))
      if (elapsed < 25) assert.equal(name,set+':kick2/'+Number(facing===1))
      else if (elapsed < 32) assert.equal(name,normal)
    }
  }
})

test('Eeries emitted from opposite edges look in the direction they travel', () => {
  const room = campaign.levels['021']
  const marker = { spriteId: 0xcb, x: 128, y: 368 }
  const sequence = campaign.emitters![0xcb]
  for (const side of [-1, 1]) {
    const event = sequence.events.find(row => Math.sign(row[4]) === side)!
    const state = createGame(campaign), p = state.players.mario
    Object.assign(p, { roomId:room.id, x:marker.x, y:marker.y })
    state.tick = event[0]
    stepEmitters({ state, campaign }, { ...room, sprites:[marker] }, [p])
    const eerie = state.entities.find(e => e.spriteId === 0x38)!
    assert.equal(eerie.facing, side)
    assert.equal(mirrorEntity(eerie), false)
    assert.equal(graphic(eerie,state.tick,room.spriteTileset),
      room.spriteTileset+'-56'+(side > 0 ? ':right/' : '/')+(palFrame(state.tick)%32))
  }
})
