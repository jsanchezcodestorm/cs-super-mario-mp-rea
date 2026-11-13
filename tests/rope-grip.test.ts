import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { Buttons, createGame, type CampaignDefinition } from '@smw/core'
import { entityFromSpawn } from '../packages/core/src/species.ts'
import { carryRopePlayer, moveRopePlayer } from '../packages/core/src/rope-motor.ts'

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json','utf8'))

for (const [id, pinX, pinY, height] of [['0dd',96,256,80], ['00f',3280,288,144]] as const) {
  test('native grip boundaries and controls for both seats on rope at '+id+'/'+pinX, () => {
    const state = createGame(campaign), world = { campaign, state }
    const spawn = campaign.levels[id].sprites.find(s => s.spriteId===0x64 && s.x===pinX)!
    const rope = entityFromSpawn(id, spawn, 'test-rope')!
    state.entities = [rope]
    assert.equal(rope.height, height)
    for (const p of Object.values(state.players)) {
      p.roomId=id
      for (const small of [true,false]) {
        p.height=small?16:28
        p.form=small?'small':'super'
        const bottom = (small?48:62) + height-80
        function place(dx: number, dy: number, buttons: number) {
          delete p.ropeId
          delete p.ropeReleased
          p.x=pinX+dx+2
          p.y=pinY+dy+32-p.height
          carryRopePlayer(world,rope,p,buttons)
        }
        for (const [x,y,hit] of [[-19,30,false],[-18,30,true],[2,30,true],[3,30,false],
          [-8,-17,false],[-8,-16,true],[-8,bottom,true],[-8,bottom+1,false]] as const) {
          place(x,y,Buttons.up)
          assert.equal(!!p.ropeId,hit)
        }
        for (const direction of [0,Buttons.down,Buttons.left,Buttons.right,Buttons.spin]) {
          place(-8,30,direction)
          assert.equal(p.ropeId,undefined)
        }
        p.netTurn = { x: pinX, y: pinY, roomId: id, tick: state.tick, offsetX: 0, fromBehind: false }
        place(-8,30,Buttons.up)
        assert.equal(p.ropeId,undefined)
        delete p.netTurn
        p.netClinging = p.behindNet = p.vineClinging = true
        p.netPunchTick = state.tick
        place(-8,30,Buttons.up)
        assert.ok(!p.netClinging && !p.vineClinging && !p.behindNet && p.netPunchTick === undefined)
        for (const direction of [0,Buttons.left,Buttons.right,Buttons.spin]) {
          const y=p.y
          for (let tick=0;tick<72;tick++) {
            state.tick++
            assert.equal(moveRopePlayer(world,p,direction,tick===0?direction:0),true)
            assert.equal(p.vy,0)
            carryRopePlayer(world,rope,p,direction)
            assert.equal(p.y,y)
          }
        }
        moveRopePlayer(world,p,Buttons.jump,Buttons.jump)
        assert.equal(p.ropeId,undefined)
        assert.ok(p.vy<0)
      }
    }
  })
}
