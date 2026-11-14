import { leaveQuestionBonus } from './question-bonus.ts'
import { reloadTurnBlocks } from './turn-block.ts'
import { pipeEntry } from './pipe-entry.ts'
import { chainPhases, positionChainDeck } from './flying-platforms.ts'
import { pairScalePans } from './scale-platforms.ts'
import { startScrollAt } from './autoscroll.ts'
import type {
  CampaignDefinition,
  GameState,
  PlayerState,
  PlayerId,
  PlayerProfile,
  World,
  EntityKind,
  EntryPoint,
  Spawn,
  GameEvent,
} from './types.ts'
import { arenaEntry, prepareArena } from './arena.ts'
import { entityFromSpawn } from './species.ts'
import { initializeHazard } from './hazard-motion.ts'

export function emit(world: World, type: GameEvent['type'], player?: PlayerState, exit?: GameEvent['exit']) {
  const event: GameEvent = {
    type,
    tick: world.state.tick,
    playerId: player?.id,
    roomId: player?.roomId,
    exit,
  }
  world.state.events.push(event)
  return event
}
export function spawnEntity(world: World, roomId: string, spawn: Spawn, kind?: EntityKind) {
  const entity = entityFromSpawn(roomId, spawn, String(world.state.nextEntity++), kind)
  if (entity) {
    const room = world.campaign.levels[roomId]
    if (!room) throw new Error('Unknown sprite room ' + roomId)
    initializeHazard(world, room, entity)
    world.state.entities.push(entity)
  }
  return entity
}
export function spawnBlockReward(world: World, roomId: string, spawn: Spawn) {
  const e = spawnEntity(world, roomId, spawn)
  // PowerUpRt selects OBJ1 during $1540 only on stationary Map16 blocks.
  if (e && [0x74, 0x75, 0x76, 0x78].includes(e.spriteId)) e.blockReleaseTick = world.state.tick
  return e
}
export function enterRoom(world: World, p: PlayerState, id: string, position?: EntryPoint) {
  const room = world.campaign.levels[id]
  if (!room) throw new Error('Unknown destination room ' + id)
  if (world.state.loadedRooms.includes(id)) {
    reloadTurnBlocks(world, room, p)
  } else {
    world.state.loadedRooms.push(id)
    if (room.specialMode7) prepareArena(world, room)
    for (const spawn of room.sprites) {
      if (spawn.spriteId === 0x8f) {
        const left = spawnEntity(world, id, spawn)!
        const right = spawnEntity(world, id, spawn)!
        pairScalePans(left, right)
      } else if (spawn.spriteId === 0xe0) {
        for (const phase of chainPhases) {
          const deck = spawnEntity(world, id, { ...spawn, spriteId: 0xa3 })!
          deck.chainPhase = phase
          positionChainDeck(deck)
        }
      } else if (spawn.spriteId === 0x61) {
        for (let part = 0; part < 4; part++) {
          const skull = spawnEntity(world, id, { ...spawn, x: spawn.x + 16 * part })!
          skull.raftX = spawn.x
          skull.width = 16
        }
      } else if (spawn.spriteId === 0xde) {
        for (let part = 0; part < 5; part++) {
          const ghost = spawnEntity(world, id, { ...spawn, x: spawn.x + (part - 2) * 16, spriteId: 0x39 })!
          ghost.eerieAcceleration = part % 2 ? -1 : 1
          ghost.vy = ghost.eerieAcceleration * 23 / 16
          ghost.vx = ghost.x < (position ?? room.spawn).x ? 1 : -1
        }
      } else {
        const actor = spawnEntity(world, id, spawn)
        if (actor?.spriteId === 0xa3) positionChainDeck(actor)
      }
    }
  }
  if (p.ducking) {
    delete p.ducking
    p.height = p.form === 'small' ? 16 : 28
  }
  delete p.death
  delete p.starTrail
  delete p.formChange
  delete p.sliding
  delete p.queuedLandJump
  delete p.wallRun
  delete p.animation
  delete p.netTurn
  delete p.ropeId
  delete p.ropeReleased
  delete p.netClinging
  delete p.vineClinging
  delete p.netPunchTick
  delete p.behindNet
  leaveQuestionBonus(world, p, id)
  p.roomId = id
  delete p.cloud
  const entry = position ?? room.spawn
  const point = room.specialMode7 ? arenaEntry(room) : entry.pipe ? pipeEntry(room, entry, p) : entry
  delete p.pipeExit
  // Secondary exits can have a pipe direction without matching Map16 mouth tiles.
  if (entry.pipe && !room.specialMode7) {
    const horizontal = entry.pipe === 'left' || entry.pipe === 'right'
    const frames = horizontal ? 28 : entry.pipe === 'up' ? 30 : p.form === 'small' ? 15 : 28
    const mountedFrames = p.mounted ? (horizontal ? 26 : 10) : 0
    p.pipeExit = {
      x: point.x,
      y: point.y,
      direction: entry.pipe,
      tick: world.state.tick,
      frames: frames + mountedFrames,
    }
  }
  p.scrollClock = startScrollAt(room, point.x)
  Object.assign(p, {
    x: point.x,
    y: point.y,
    vx: 0,
    vy: 0,
    grounded: false,
    layer2Ground: false,
    cooldown: 18,
    spin: false,
    flight: 0,
    balloon: 0,
  })
  delete p.capeFlight
}
export function initialPlayer(identity: PlayerProfile, course: string): PlayerState {
  return {
    id: identity.id,
    nickname: identity.nickname,
    character: identity.character,
    roomId: course,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    width: 12,
    height: 16,
    grounded: false,
    growthPending: false,
    lives: 5,
    reserve: null,
    score: 0,
    bonusStars: 0,
    form: 'small',
    status: 'alive',
    facing: 1,
    coins: 0,
    dragonCoins: 0,
    mounted: false,
    yoshiColor: 'green',
    mouth: null,
    tongue: 0,
    tongueFrame: 0,
    wingTicks: 0,
    invincible: 0,
    star: 0,
    spin: false,
    timer: 0,
    lastInput: 0,
    carrying: null,
    cooldown: 0,
    runTicks: 0,
    flight: 0,
    balloon: 0,
  }
}
export function copyState(state: GameState): GameState {
  return structuredClone(state)
}
export function initialCourses(campaign: CampaignDefinition) {
  return (campaign.initial ?? [campaign.start]).filter((id) => Object.hasOwn(campaign.levels, id))
}
