import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { bump } from '../src/blocks.ts'
import { settleBlockBounces } from '../src/block-bounce.ts'
import { startCourse } from '../src/campaign.ts'
import { createGame, type CampaignDefinition, type LevelDefinition, type PlayerId } from '../src/index.ts'
import { enterRoom } from '../src/state.ts'
import { tileAt, USED } from '../src/terrain.ts'
import type { World } from '../src/types.ts'

const file = new URL('../../../generated/content.json', import.meta.url)
const extracted = { skip: !existsSync(file) && 'Prepare PAL E1 with npm run extract' }
const campaign: CampaignDefinition = existsSync(file) && JSON.parse(readFileSync(file, 'utf8'))
const QUESTION = 0x124
const CORRECT = 0x15e

function enter(roomId: string) {
  const world = { campaign, state: createGame(campaign) }
  startCourse(world, campaign.start)
  for (const p of Object.values(world.state.players)) enterRoom(world, p, roomId)
  return world
}

function hit(world: World, room: LevelDefinition, col: number, row: number, tick: number, id: PlayerId) {
  world.state.tick = tick
  settleBlockBounces(world)
  bump(world, world.state.players[id], room, { col, row, tile: tileAt(world, room, col, row) })
}

test('Mario and Luigi complete all five rows in each of the nine PAL rooms', extracted, () => {
  const rooms = Object.values(campaign.levels).filter((room) => room.tileset === 4 && room.tiles.includes(QUESTION))
  assert.equal(rooms.length, 9)
  for (const room of rooms) {
    const world = enter(room.id)
    const { mario, luigi } = world.state.players
    let tick = 0
    const rows = new Set(room.tiles.flatMap((tile, i) => tile === QUESTION ? [Math.floor(i / room.width)] : []))
    assert.equal(rows.size, 5)
    for (const row of rows) {
      const cols = room.tiles.slice(row * room.width, (row + 1) * room.width)
        .flatMap((tile, col) => tile === QUESTION ? [col] : [])
      assert.equal(cols.length, 3)
      hit(world, room, cols[0], row, tick + 2, 'mario') // PAL phase 1
      hit(world, room, cols[0], row, tick + 2, 'luigi')
      hit(world, room, cols[2], row, tick + 14, 'luigi') // PAL phase 3
      hit(world, room, cols[1], row, tick + 24, 'mario') // Third always succeeds, including phase 0.
      tick += 48
      world.state.tick = tick
      settleBlockBounces(world)
      assert.ok(cols.every((col) => tileAt(world, room, col, row) === CORRECT))
    }
    assert.deepEqual([mario.coins, luigi.coins, mario.score, luigi.score], [5, 5, 50, 50])
    assert.deepEqual([mario.lives, luigi.lives], [5, 5])
    assert.equal(world.state.entities.filter((e) => e.kind === 'oneUp').length, 5)
  }
})

test('a failed first or second guess closes only the remaining questions in that row', extracted, () => {
  const room = campaign.levels['0bd']
  const world = enter(room.id)
  hit(world, room, 4, 21, 0, 'luigi') // PAL phase 0 fails on the first guess.
  hit(world, room, 8, 17, 3, 'mario') // PAL phase 2 passes on the first guess.
  hit(world, room, 5, 17, 12, 'luigi') // PAL phase 2 fails on the second.
  world.state.tick = 30
  settleBlockBounces(world)
  assert.deepEqual([4, 7, 10].map((col) => tileAt(world, room, col, 21)), [USED, USED, USED])
  assert.deepEqual([5, 8, 11].map((col) => tileAt(world, room, col, 17)), [USED, CORRECT, USED])
  assert.equal(tileAt(world, room, 4, 13), QUESTION)
  assert.equal(world.state.players.mario.coins, 1)
  assert.equal(world.state.players.luigi.coins, 0)
})

test('the second player can finish the visit after the first leaves; re-entry locks the game until the next course', extracted, () => {
  const room = campaign.levels['0bd']
  const world = enter(room.id)
  const { mario, luigi } = world.state.players
  hit(world, room, 4, 21, 2, 'mario')
  enterRoom(world, mario, campaign.start)
  hit(world, room, 7, 21, 14, 'luigi')
  assert.equal(luigi.coins, 1)
  enterRoom(world, luigi, campaign.start)
  enterRoom(world, mario, room.id)
  hit(world, room, 4, 21, 26, 'mario')
  world.state.tick = 36
  settleBlockBounces(world)
  assert.equal(mario.coins, 1)
  assert.ok([4, 7, 10].every((c) => tileAt(world, room, c, 21) === USED))
  startCourse(world, campaign.start)
  enterRoom(world, mario, room.id)
  hit(world, room, 4, 21, 50, 'mario')
  assert.equal(mario.coins, 2)
})
