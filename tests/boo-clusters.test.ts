import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type Phaser from 'phaser'
import { palFrame, type CampaignDefinition, type GameState } from '@smw/core'
import { stepBooGroups } from '../packages/core/src/boo-clusters.ts'
import { prepareCourse } from './coop/inputs.ts'
import { queueBooGroups } from '../apps/web/src/game/boo-cluster-view.ts'
import type { ObjectPlanes, ObjPart } from '../apps/web/src/game/object-planes.ts'

const campaign = JSON.parse(readFileSync('generated/content.json','utf8')) as CampaignDefinition
const art = JSON.parse(readFileSync('generated/boo-clusters.json','utf8'))
const scene = { cache:{ json:{ get:()=>art } },textures:{ get:()=>({ getSourceImage:()=>({}) }) } } as unknown as Phaser.Scene
function setup(room: string, entry: string, x: number, other=x) {
  const { c, state } = prepareCourse(campaign, entry)
  const world = { campaign:c, state }, players = Object.values(state.players)
  for (const [i, p] of players.entries()) { p.roomId=room; p.x = i ? other : x; p.y = 280 }
  const advance = (frames: number) => {
    const end = palFrame(state.tick) + frames
    while (palFrame(state.tick) < end) {
      state.tick++
      stepBooGroups(world,c.levels[room],players)
    }
  }
  return { state, advance }
}
function draw(state: GameState, room: string, x: number, y: number) {
  const parts: ObjPart[] = []
  queueBooGroups(scene, { queue: (p: ObjPart) => parts.push(p) } as ObjectPlanes, room, state, {x,y})
  return parts
}

test('co-op activates both Boo ring directions for players on separate screens and a late snapshot preserves the composition', () => {
  const {state, advance} = setup('107','107',495,2560)
  advance(1)
  const before = Object.values(state.players).map(p=>[p.x,p.y,p.form,p.lives])
  assert.equal(state.booGroups!['107'].length,2)
  for (const [center, baseSlot] of [[496,10],[2560,0]]) {
    const take = () => draw(state,'107',center-128,216)
    const initial = take()
    assert.equal(initial.length,10)
    assert.equal(new Set(initial.map(g=>g.oam)).size,10)
    assert.ok(initial.every(g=>g.priority===3 && g.flipX===true))
    const first = initial.find(g=>g.oam===art.slots[baseSlot])!
    assert.equal(first.y,184)
    assert.deepEqual(take(),draw(structuredClone(state),'107',center-128,216))
  }
  advance(127)
  for (const [x0,slot,dx] of [[496,10,-80],[2560,0,80]]) {
    const first = draw(state,'107',x0-128,216).find(g=>g.oam===art.slots[slot])!
    assert.deepEqual([first.x,first.y],[128+dx,104])
  }
  assert.deepEqual(Object.values(state.players).map(p=>[p.x,p.y,p.form,p.lives]),before)
})

test('ceiling Boos dive and return while waiting ghosts wrap across the camera', () => {
  const {state,advance} = setup('004','004',72)
  advance(1)
  assert.equal(state.booGroups!['004'][0].ceiling!.ghosts.length,20)
  const dived = new Set<number>()
  for (let f = 0; f < 512; f++) {
    advance(1)
    state.booGroups!['004'][0].ceiling!.ghosts.forEach((g,i)=>{if(g.mode)dived.add(i)})
  }
  assert.ok(dived.size >= 10)
  assert.ok(draw(state,'004',0,160).length > 0)
})

test('fog fades through its native palettes, changes pattern and yields to the rings after the D2 marker', () => {
  const {state,advance} = setup('0f8','018',496)
  const rows = new Set<number>()
  for (let i=0;i<256;i++) {
    advance(1)
    for(const part of draw(state,'0f8',350,160)) rows.add(part.sy/16)
  }
  assert.deepEqual([...rows].sort(),[2,3,4,5,6,7,8,9])
  for(const p of Object.values(state.players))p.x=1460
  advance(257)
  assert.equal(state.booGroups!['0f8'][0].stopped,true)
  assert.equal(draw(state,'0f8',1350,160).length,0)
  for(const p of Object.values(state.players))p.x=1750
  advance(1)
  assert.ok(draw(state,'0f8',1650,223).length>0)
})
