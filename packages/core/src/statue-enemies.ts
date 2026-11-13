import { playerViewport } from './autoscroll.ts'
import { palFrame } from './pal-time.ts'
import { playerContactBody } from './player-size.ts'
import { hurt } from './resources.ts'
import { nextSpriteRandom } from './sprite-random.ts'
import { recordShatter } from './spin-block.ts'
import { emit, spawnEntity } from './state.ts'
import { clipDisplacement, moveBody, overlaps } from './terrain.ts'
import type { EntityState, PlayerState, World } from './types.ts'

const blockEnemies = [0x15, 0x0f, 0, 4]
const flopX = [8, -8, 16, -16, 4, -4, 20, -20]
const flopY = [-32, -24, -48, -40]

/** E1 $02:E41F shakes at one quarter pixel and opens inside [-96, 96). */
export function stepExplodingBlock(world: World, e: EntityState, player: PlayerState) {
  const clock = e.resident!.clock
  if (clock & 64) e.x += clock & 4 ? -0.25 : 0.25
  const x = Math.floor(e.x), dx = Math.floor(player.x) - x
  const view = playerViewport(world.campaign.levels[e.roomId], player)
  if (((dx + 96) & 255) >= 192 || x < view.x || x >= view.x + 256) return
  const child = spawnEntity(world, e.roomId, { x, y: e.y, spriteId: blockEnemies[e.resident!.variant] })!
  child.facing = dx < 0 ? -1 : 1
  child.fromEnemyBlock = true
  child.vx = 0
  child.vy = -3
  e.active = false
  recordShatter(world.state, e.roomId, x, Math.floor(e.y))
  emit(world, 'shatter', player)
}

/** The initial jump and land-fish flops use the native sprite gravity per PAL frame. */
export function moveBlockEnemy(world: World, e: EntityState) {
  const frame = palFrame(world.state.tick)
  if (frame === palFrame(world.state.tick - 1)) return
  const room = world.campaign.levels[e.roomId]
  const travel = e.vx
  const contacts = moveBody(world, room, e)
  if (contacts.some(hit => hit.side === 'left' || hit.side === 'right')) {
    e.vx = -travel
    e.facing = e.vx < 0 ? -1 : 1
  }
  e.vy = Math.min(4, e.vy + 3/16)
  if (e.y > room.height * 16 + 96) e.active = false
  if (!e.grounded) return
  if (e.spriteId !== 0x15 || room.water) {
    delete e.fromEnemyBlock
    e.vx = e.facing! * 0.5
    if (e.spriteId === 0x0f) delete e.facing // On landing the ordinary walking AI controls its direction.
    return
  }
  e.vx = flopX[(nextSpriteRandom(world.state) + frame) & 7] / 16
  e.vy = flopY[nextSpriteRandom(world.state) & 3] / 16
  if (!(nextSpriteRandom(world.state) & 128)) e.facing = e.vx < 0 ? -1 : 1
}

export function stepBowserStatue(world: World, e: EntityState, target: PlayerState, frame: number) {
  const state = e.resident!, room = world.campaign.levels[e.roomId]
  const jumping = state.variant === 2
  if (state.timer) state.timer--
  state.pose = Number(jumping && e.vy < 1)
  if ((state.variant & 1) && !((frame + state.phase * 4) & 127)) {
    const facing = e.facing!
    const fire = spawnEntity(world, e.roomId, { x:e.x + facing * 16, y:e.y - 2, spriteId:0xb3 }, 'bullet')!
    fire.facing = facing
    fire.vx = facing
    fire.emission = { c2: 0, facing: Number(facing < 0) }
  }
  const travel = e.vx
  const contacts = moveBody(world, room, e)
  e.vy = Math.min(4, e.vy + 3/16)
  if (jumping && contacts.some(hit => hit.side === 'left' || hit.side === 'right')) {
    e.vx = -travel
    e.facing = e.vx < 0 ? -1 : 1
  }
  if (!e.grounded) return
  e.vx = 0
  e.vy = jumping ? 1 : 0
  if (jumping && state.timer === 1) {
    e.vy = -4
    e.facing = target.x < e.x ? -1 : 1
    e.vx = e.facing
  } else if (jumping && !state.timer) state.timer = 48
}

export function statueContact(world: World, e: EntityState, p: PlayerState, foot: number) {
  if (e.resident?.variant === 2) {
    if (overlaps(playerContactBody(p), {x:e.x+1,y:e.y-2,width:13,height:22})) hurt(world, p)
    return
  }
  const room = world.campaign.levels[e.roomId]
  if (p.x + p.width <= e.x || p.x >= e.x + e.width || p.y + p.height < e.y || p.y >= e.y + e.height) return
  if (foot <= e.y + 2 && p.vy >= 0) {
    p.y = clipDisplacement(world, room, p, 'y', e.y - p.height - p.y)
    p.grounded = true; p.vy = 0
  } else if (foot - p.height >= e.y + e.height - 2 && p.vy < 0) {
    p.y = clipDisplacement(world, room, p, 'y', e.y + e.height - p.y)
    p.vy = 0
  } else {
    const side = p.x + p.width / 2 < e.x + e.width / 2 ? e.x - p.width : e.x + e.width
    p.x = clipDisplacement(world, room, p, 'x', side - p.x)
    p.vx = 0
  }
}
