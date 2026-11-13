import { stepMapClouds } from './overworld-clouds.ts'
import { stepStarTrail } from './star-trail.ts'
import { advanceRewardEffects } from './reward-effects.ts'
import { expireShatters } from './spin-block.ts'
import { advanceNetDoors } from './net-door.ts'
import { punchNetKoopa } from './net-punch.ts'
import { releaseShell } from './shell-motion.ts'
import { advanceGoalWalk } from './goal-walk.ts'
import { keyholeFrame } from './keyhole.ts'
import { finishMapTransition } from './overworld.ts'
import { orbFinishFrame } from './orb-finish.ts'
import { playerAnimation } from './player-animation.ts'
import { shellContact, stepKnockedOut } from './shell-contact.ts'
import { resumeBonus, stepBonus } from './bonus-game.ts'
import { guideCoins } from './directional-coins.ts'
import { stepEmitters } from './emitters.ts'
import { stepBooGroups } from './boo-clusters.ts'
import { feedBaby } from './yoshi-growth.ts'
import { stepBerries } from './yoshi-berries.ts'
import { carryDeckRider } from './platform-rider.ts'
import { deckBounds, type PreviousFoot } from './deck-bounds.ts'
import { stepLayer } from './layer-two.ts'
import { stepEntrance } from './entrance.ts'
import { activePlayerIds, Buttons, playerIds } from './types.ts'
import type { CampaignDefinition, GameState, World, EntityState, PlayerState, InputFrame } from './types.ts'
import { stepPlayer } from './player.ts'
import { die } from './resources.ts'
import { moveEntity } from './entity-motion.ts'
import { contact, strike, weaponTargets } from './entity-contact.ts'
import { navigate, returnToMap } from './campaign.ts'
import { overlaps } from './terrain.ts'
import { settleBlockBounces } from './block-bounce.ts'
import { settleTurnBlocks } from './turn-block.ts'
import { advanceEntityDefeat } from './entity-defeat.ts'

const playerProjectiles = new Set<EntityState['kind']>(['fireball', 'yoshiFire'])

function carry(e: EntityState, p: PlayerState, buttons: number) {
  if (p.carrying !== e.id) return false
  if (p.status === 'alive' && p.roomId === e.roomId && buttons & Buttons.run) {
    e.x = p.x + (p.facing === 1 ? p.width : -e.width)
    e.y = p.y + p.height / 2 - e.height / 2
    return true
  }
  e.x = p.x
  e.y = p.y - 6
  if (e.kind === 'shell') releaseShell(e, p, buttons)
  else {
    e.vx = p.facing * (e.kind === 'throwBlock' ? 3.5 : 2)
    e.vy = buttons & Buttons.up ? -5 : -1
  }
  e.owner = p.id
  if (p.status === 'alive') playerAnimation(p).kick = 12
  p.cooldown = 16
  p.carrying = null
  return false
}
function projectileContact(world: World, entity: EntityState) {
  if (
    !entity.owner ||
    (entity.kind !== 'fireball' &&
      entity.kind !== 'yoshiFire' &&
      !(entity.kind === 'mechaShell' && entity.vy < -0.1) &&
      entity.kind !== 'throwBlock')
  )
    return
  for (const target of world.state.entities) {
    if (
      !target.active ||
      target.roomId !== entity.roomId ||
      !weaponTargets.has(target.kind) ||
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
function updateEntities(world: World, inputs: InputFrame, feet: Record<string, PreviousFoot>) {
  const { state } = world
  const transported = new Map<PlayerState['id'], EntityState>()
  for (const entity of [...state.entities]) {
    if (entity.defeat) {
      advanceEntityDefeat(world, entity)
      continue
    }
    if (entity.shellKnockedOut) {
      stepKnockedOut(world, entity)
      continue
    }
    if (!entity.active) continue
    const players = playerIds
      .map((id) => state.players[id])
      .filter((p) => p.status === 'alive' && p.roomId === entity.roomId)
    if (!players.length) {
      if (entity.emission || playerProjectiles.has(entity.kind)) entity.active = false
      continue
    }
    const nearest = players.reduce((a, b) => (Math.abs(a.x - entity.x) < Math.abs(b.x - entity.x) ? a : b))
    if (entity.kind === 'directionalCoins') {
      entity.age++
      guideCoins(world, world.campaign.levels[entity.roomId], entity, inputs[entity.owner ?? nearest.id])
      continue
    }
    if (entity.emission && Math.abs(nearest.x - entity.x) > 360) entity.active = false
    const followsRoom = entity.kind === 'exitSide' || (entity.kind === 'magikoopa' && entity.age > 0)
    if (!followsRoom && Math.abs(nearest.x - entity.x) > 360) {
      if (playerProjectiles.has(entity.kind)) entity.active = false
      continue
    }
    if (entity.owner && carry(entity, state.players[entity.owner], inputs[entity.owner])) {
      if (entity.kind === 'shell') shellContact(world, entity)
      if (entity.kind === 'babyYoshi') {
        entity.age++
        feedBaby(world, entity, state.players[entity.owner])
      }
      continue
    }
    const old = entity.kind === 'platform' || entity.kind === 'flyingQuestion' ? deckBounds(entity) : undefined
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
    if (entity.kind === 'shell' && entity.active) shellContact(world, entity)
    else projectileContact(world, entity)
    for (const p of players) {
      if (old) {
        const previous = transported.get(p.id)
        // FloatingSkullMain applies each contacted skull's own integer movement.
        const sameRaft = entity.spriteId === 0x61 && previous?.spriteId === 0x61 && previous.raftX === entity.raftX
        if (entity.active && (!previous || sameRaft) && carryDeckRider(world, entity, p, feet[p.id], old)) {
          transported.set(p.id, entity)
          continue
        }
      }
      contact(world, entity, p, inputs[p.id], feet[p.id].bottom, old, feet[p.id].x)
      if (state.phase !== 'playing') return
    }
    // E1 checks the punch after the Koopa moves and resolves ordinary body contact.
    if (entity.active && entity.netKoopa)
      for (const p of players) punchNetKoopa(world, entity, p)
  }
  const mouths = [state.players.mario.mouth, state.players.luigi.mouth]
  state.entities = state.entities.filter((e) => e.active || e.shellKnockedOut || e.defeat ||
    mouths.some(food => food?.entityId === e.id && food.ticks === 0))
}
export function stepGame(campaign: CampaignDefinition, state: GameState, inputs: InputFrame) {
  const world = { campaign, state }
  state.tick++
  state.events = []
  if (state.cutscene) {
    const elapsed = state.tick - state.cutscene.start
    const skip =
      elapsed > 30 && activePlayerIds(state).some((id) => inputs[id] & ~state.players[id].lastInput & Buttons.action)
    if (skip || elapsed >= state.cutscene.duration) delete state.cutscene
  } else if (state.goalWalk) {
    advanceGoalWalk(world)
    if (!state.goalWalk && state.phase === 'map') finishMapTransition(state, inputs)
  } else if (state.orbFinish) {
    if (orbFinishFrame(state.orbFinish, state.tick).finished) {
      const { bonus } = state.orbFinish
      delete state.orbFinish
      if (bonus) resumeBonus(world, bonus)
      else finishMapTransition(state, inputs)
    }
  } else if (state.keyholeFinish) {
    if (keyholeFrame(state.keyholeFinish.tick, state.tick).finished) {
      delete state.keyholeFinish
      finishMapTransition(state, inputs)
    }
  } else if (state.phase === 'map') {
    navigate(world, inputs)
    if (state.phase === 'map') stepMapClouds(world)
  }
  else if (state.phase === 'ending' || state.phase === 'gameOver') returnToMap(state, inputs)
  else if (state.phase === 'playing' && state.entrance) stepEntrance(world, inputs)
  else if (state.phase === 'playing') {
    const activePlayers = activePlayerIds(state).map((id) => state.players[id]).filter((p) => p.status === 'alive')
    for (const id of new Set(activePlayers.map((p) => p.roomId))) {
      const present = activePlayers.filter((p) => p.roomId === id)
      stepLayer(world, campaign.levels[id], present)
      stepEmitters(world, campaign.levels[id], present)
      stepBooGroups(world, campaign.levels[id], present)
    }
    const previousBonus=state.bonus
    const tops={mario:state.players.mario.y,luigi:state.players.luigi.y}
    const feet = {
      mario: { x: state.players.mario.x, bottom: state.players.mario.y + state.players.mario.height },
      luigi: { x: state.players.luigi.x, bottom: state.players.luigi.y + state.players.luigi.height },
    }
    settleBlockBounces(world)
    expireShatters(state)
    advanceNetDoors(state)
    advanceRewardEffects(state)
    settleTurnBlocks(world)
    if (state.silverSwitch > 0) state.silverSwitch--
    if (state.pSwitch > 0) state.pSwitch--
    for (const id of activePlayerIds(state)) {
      stepPlayer(world, state.players[id], inputs[id])
      stepStarTrail(state.players[id], state.tick)
      if (state.phase !== 'playing') break
    }
    if (state.phase === 'playing') updateEntities(world, inputs, feet)
    if (state.phase === 'playing') {
      for (const id of activePlayerIds(state)) stepBerries(world, state.players[id], inputs[id])
    }
    if(previousBonus && previousBonus===state.bonus)stepBonus(world,tops)
    if (state.phase === 'playing' && !state.bonus && state.timeLeft > 0 && state.tick % 41 === 0 && --state.timeLeft === 0) {
      for (const id of activePlayerIds(state)) die(world, state.players[id])
      state.timeLeft = campaign.levels[state.progress.course].timeLimit ?? 400
    }
  }
  for (const id of playerIds) state.players[id].lastInput = inputs[id]
  return state
}
