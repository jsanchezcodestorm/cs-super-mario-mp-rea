import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createGame, stepGame, type CampaignDefinition, type EntityState } from '@smw/core'
import { startCourse } from '../packages/core/src/campaign.ts'
import { deckBounds } from '../packages/core/src/deck-bounds.ts'
import { contact } from '../packages/core/src/entity-contact.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'))
campaign.start = '00c'
campaign.initial = ['00c']
const room = campaign.levels['00c']
function playScale() {
  const state = createGame(campaign)
  startCourse({ campaign, state }, room.id)
  const pans = state.entities.filter(e => e.scale)
  assert.equal(pans.length, 18)
  // Keep the two first pans in the real room, with the local camera and both
  // riders positioned at the crossing. Each player still runs normal physics.
  const [left, right] = pans
  state.entities = [left, right]
  const { mario, luigi } = state.players
  for (const [i, p] of [mario, luigi].entries())
    Object.assign(p, { x: left.x + 2 + 12*i, y: left.y - p.height, grounded: true, scrollClock: 650 })
  return { state, left, right, mario, luigi, step: () => stepGame(campaign, state, { mario: 0, luigi: 0 }) }
}

test('both pan spacings are loaded in Butter Bridge, with no solid surface between the caps', () => {
  const state = createGame(campaign)
  startCourse({ campaign, state }, room.id)
  const pans = state.entities.filter(e => e.scale)
  for (const left of pans.filter(e => !e.scale!.right)) {
    const right = pans.find(e => e.id === left.scale!.partner)!
    assert.equal(left.x, left.origin.x - 8)
    assert.equal(left.width, 32)
    assert.equal(right.x - left.x, left.origin.x & 16 ? 64 : 128)
    assert.equal(left.y, right.y)
  }
})

test('two riders share the load on one pan, counterbalance on opposite pans, and release the scale', () => {
  const { state, left, right, mario, luigi, step } = playScale()
  const origin = left.y
  for (let i=0; i<48; i++) {
    step()
    assert.equal(left.y + right.y, 2 * origin)
    for (const player of [mario, luigi]) assert.equal(player.y + player.height, left.y)
  }
  assert.ok(left.y > origin + 15)
  const tile = (left.origin.y >> 4) * room.width + (left.origin.x >> 4)
  assert.equal(state.tileChanges[room.id][tile], 0x25)
  Object.assign(luigi, { x: right.x+5, y: right.y-luigi.height })
  step()
  const held = left.y
  for (let i=0; i<25; i++) {
    step()
    assert.equal(left.y, held)
    assert.equal(mario.y + mario.height, left.y)
    assert.equal(luigi.y + luigi.height, right.y)
  }
  mario.x = luigi.x = left.x + left.width + 2
  for (let i=0; i<20; i++) step()
  assert.ok(left.y < held)
})

test('rising decks catch falling feet at the swept surface and one-way decks let players jump through', () => {
  const { state, left, mario } = playScale()
  const old = deckBounds(left)
  left.y -= 9
  Object.assign(mario, { x: left.x + 1, y: old.y - mario.height - 6, vy: 1, grounded: false })
  contact({campaign,state}, left, mario, 0, old.y-7, old, mario.x)
  assert.equal(mario.y + mario.height, left.y)
  assert.ok(mario.grounded)
  Object.assign(mario, { x: left.x+left.width, y: left.y-mario.height+1, grounded: false })
  contact({campaign,state}, left, mario, 0, old.y-2, old, mario.x)
  assert.ok(!mario.grounded)
  Object.assign(mario, { x: left.x, y: left.y+2, vy: -2 })
  contact({campaign,state}, left, mario, 0, left.y+20, old, mario.x)
  assert.equal(mario.vy,-2)
  assert.ok(!mario.grounded)
})

test('the side and underside of solid decks stop either player without catching a rider on the wings', () => {
  const { state, left, mario, luigi } = playScale()
  const world = { campaign, state }
  for (const id of [0x49,0x9c,0xbb]) for (const player of [mario,luigi]) {
    const deck: EntityState = {...left, spriteId:id, scale:undefined, x:360, y:200, width:32, height:32}
    const old=deckBounds(deck)
    Object.assign(player,{x:deck.x-8,y:deck.y+2,vy:0,vx:3,grounded:false})
    contact(world, deck, player, 0, player.y+player.height, old, old.x-player.width)
    assert.equal(player.x + player.width, old.x)
    assert.equal(player.vx,0)
    Object.assign(player,{x:deck.x+5,y:old.y+old.height-2,vy:-4})
    contact(world,deck,player,0,old.y+old.height+player.height+1,old,player.x)
    assert.equal(player.y,old.y+old.height)
    assert.equal(player.vy,0)
    Object.assign(player,{x:old.x+old.width,y:deck.y-player.height+0.5,vy:1,grounded:false})
    contact(world,deck,player,0,deck.y-1,old,player.x)
    assert.ok(!player.grounded)
  }
})
