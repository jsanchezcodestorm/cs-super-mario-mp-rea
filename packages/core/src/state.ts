import { startScrollAt } from './autoscroll.ts'
import type {
  CampaignDefinition,
  GameState,
  PlayerState,
  PlayerId,
  World,
  EntityKind,
  Point,
  Spawn,
  GameEvent,
} from './types.ts'
import { arenaEntry, prepareArena } from './arena.ts'
import { entityFromSpawn } from './species.ts'

export function emit(world: World, type: GameEvent['type'], player?: PlayerState, exit?: GameEvent['exit']) {
  world.state.events.push({
    type,
    tick: world.state.tick,
    playerId: player?.id,
    roomId: player?.roomId,
    exit,
  })
}
export function spawnEntity(world: World, roomId: string, spawn: Spawn, kind?: EntityKind) {
  const entity = entityFromSpawn(roomId, spawn, String(world.state.nextEntity++), kind)
  if (entity) world.state.entities.push(entity)
  return entity
}
export function enterRoom(world: World, p: PlayerState, id: string, position?: Point) {
  const room = world.campaign.levels[id]
  if (!room) throw new Error('Unknown destination room ' + id)
  if (!world.state.loadedRooms.includes(id)) {
    world.state.loadedRooms.push(id)
    if (room.specialMode7) prepareArena(world, room)
    for (const spawn of room.sprites) spawnEntity(world, id, spawn)
  }
  p.roomId = id
  const point = room.specialMode7 ? arenaEntry(room) : position ?? room.spawn
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
}
export function initialPlayer(id: PlayerId, course: string): PlayerState {
  return {
    id,
    roomId: course,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    width: 12,
    height: 16,
    grounded: false,
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
