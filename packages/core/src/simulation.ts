import {stepBonus} from './bonus-game.ts'
import { stepEmitters } from './emitters.ts'
import { feedBaby } from './yoshi-growth.ts'
import { isBlockBridge } from './bridges.ts'
import { stepLayer } from './layer-two.ts'
import { stepEntrance } from './entrance.ts'
import { Buttons, playerIds } from './types.ts'
import type { CampaignDefinition, GameState, World, EntityState, PlayerState, InputFrame } from './types.ts'
import { stepPlayer } from './player.ts'
import { die } from './resources.ts'
import { moveEntity } from './entity-motion.ts'
import { contact, strike } from './entity-contact.ts'
import { navigate } from './campaign.ts'
import { overlaps, changeTile } from './terrain.ts'

function carry(e: EntityState, p: PlayerState, buttons: number) {
  if (p.carrying !== e.id) return false
  if (p.status === 'alive' && p.roomId === e.roomId && buttons & Buttons.run) {
    e.x = p.x + (p.facing === 1 ? p.width : -e.width)
    e.y = p.y + p.height / 2 - e.height / 2
    return true
  }
  e.x = p.x
  e.y = p.y - 6
  e.vx = p.facing * (e.kind === 'shell' || e.kind === 'throwBlock' ? 3.5 : 2)
  e.vy = buttons & Buttons.up ? -5 : -1
  e.owner = p.id
  p.cooldown = 16
  p.carrying = null
  return false
}
const strikeable = new Set([
  'chuck',
  'koopa',
  'walker',
  'rex',
  'spiny',
  'jumper',
  'flyer',
  'fish',
  'plant',
  'boss',
  'endingBoss',
])
function projectileContact(world: World, entity: EntityState) {
  if (
    !entity.owner ||
    (entity.kind !== 'fireball' &&
      entity.kind !== 'yoshiFire' &&
      !(entity.kind === 'mechaShell' && entity.vy < -0.1) &&
      entity.kind !== 'throwBlock' &&
      !(entity.kind === 'shell' && Math.abs(entity.vx) > 1))
  )
    return
  for (const target of world.state.entities) {
    if (
      !target.active ||
      target.roomId !== entity.roomId ||
      !strikeable.has(target.kind) ||
      !overlaps(entity, target)
    )
      continue
    if (target.kind === 'endingBoss' && entity.kind !== 'mechaShell') continue
    if (target.spriteId === 0xc5 && entity.kind !== 'throwBlock') continue
    strike(world, target, world.state.players[entity.owner])
    if (
      entity.kind === 'fireball' ||
      entity.kind === 'yoshiFire' ||
      entity.kind === 'mechaShell' ||
      entity.kind === 'throwBlock'
    ) {
      entity.active = false
      return
    }
  }
}
function updateEntities(world: World, inputs: InputFrame, bottoms: Record<string, number>) {
  const { state } = world
  for (const entity of [...state.entities]) {
    if (!entity.active) continue
    const players = playerIds
      .map((id) => state.players[id])
      .filter((p) => p.status === 'alive' && p.roomId === entity.roomId)
    if (!players.length) {
      if (entity.emission) entity.active = false
      continue
    }
    const nearest = players.reduce((a, b) => (Math.abs(a.x - entity.x) < Math.abs(b.x - entity.x) ? a : b))
    if (entity.emission && Math.abs(nearest.x - entity.x) > 360) entity.active = false
    if (entity.kind !== 'exitSide' && Math.abs(nearest.x - entity.x) > 360) continue
    if (entity.owner && carry(entity, state.players[entity.owner], inputs[entity.owner])) {
      if (entity.kind === 'babyYoshi') {
        entity.age++
        feedBaby(world, entity, state.players[entity.owner])
      }
      continue
    }
    const x = entity.x,
      y = entity.y,
      width = entity.width
    moveEntity(world, entity, nearest)
    if (entity.spriteId === 3 && entity.kind === 'walker') {
      const shell = state.entities.find(
        (e) =>
          e.active &&
          e.roomId === entity.roomId &&
          e.kind === 'shell' &&
          !e.owner &&
          !e.vx &&
          overlaps(entity, e),
      )
      if (shell) {
        entity.active = false
        shell.rainbow = true
        shell.vx = nearest.x < shell.x ? -2.6 : 2.6
        continue
      }
    }
    projectileContact(world, entity)
    for (const p of players) {
      if (
        entity.kind === 'platform' &&
        p.vy >= 0 &&
        Math.abs(bottoms[p.id] - y) < 1 &&
        p.x + p.width > x &&
        p.x < x + width
      ) {
        if (!isBlockBridge(entity)) p.x += entity.x - x
        if (p.x + p.width > entity.x && p.x < entity.x + entity.width) {
          p.y = entity.y - p.height
          p.vy = 0
          p.grounded = true
        }
      }
      contact(world, entity, p, inputs[p.id], bottoms[p.id])
      if (state.phase !== 'playing') return
    }
  }
  state.entities = state.entities.filter((e) => e.active)
}
export function stepGame(campaign: CampaignDefinition, state: GameState, inputs: InputFrame) {
  const world = { campaign, state }
  state.tick++
  state.events = []
  if (state.cutscene) {
    const elapsed = state.tick - state.cutscene.start
    const skip =
      elapsed > 30 && playerIds.some((id) => inputs[id] & ~state.players[id].lastInput & Buttons.action)
    if (skip || elapsed >= state.cutscene.duration) delete state.cutscene
  } else if (state.phase === 'map') navigate(world, inputs)
  else if (state.phase === 'playing' && state.entrance) stepEntrance(world, inputs)
  else if (state.phase === 'playing') {
    const activePlayers = playerIds.map((id) => state.players[id]).filter((p) => p.status === 'alive')
    for (const id of new Set(activePlayers.map((p) => p.roomId))) {
      const present = activePlayers.filter((p) => p.roomId === id)
      stepLayer(world, campaign.levels[id], present)
      stepEmitters(world, campaign.levels[id], present)
    }
    const previousBonus=state.bonus
    const tops={mario:state.players.mario.y,luigi:state.players.luigi.y}
    const bottoms = {
      mario: state.players.mario.y + state.players.mario.height,
      luigi: state.players.luigi.y + state.players.luigi.height,
    }
    for (const block of state.turning) {
      if (block.until === state.tick)
        changeTile(world, campaign.levels[block.roomId], block.col, block.row, 0x11e)
    }
    state.turning = state.turning.filter((block) => block.until > state.tick)
    if (state.silverSwitch > 0) state.silverSwitch--
    if (state.pSwitch > 0) state.pSwitch--
    for (const id of playerIds) {
      stepPlayer(world, state.players[id], inputs[id])
      if (state.phase !== 'playing') break
    }
    if (state.phase === 'playing') updateEntities(world, inputs, bottoms)
    if(previousBonus && previousBonus===state.bonus)stepBonus(world,tops)
    if (state.phase === 'playing' && state.timeLeft > 0 && state.tick % 41 === 0 && --state.timeLeft === 0) {
      for (const id of playerIds) die(world, state.players[id])
      state.timeLeft = campaign.levels[state.progress.course].timeLimit ?? 400
    }
  }
  for (const id of playerIds) state.players[id].lastInput = inputs[id]
  return state
}
