import { beginBonus, resumeBonus, validBonus } from './bonus-game.ts'
import { beginGoalWalk, type GoalAward } from './goal-walk.ts'
import { activePlayerIds, Buttons, MAX_MULTIPLAYER_PLAYERS, playerIds, playerCharacters } from './types.ts'
import { beginOverworldTravel, navigateOverworld, resetMapPlayers } from './overworld.ts'
import type {
  World,
  CampaignDefinition,
  GameState,
  CampaignSave,
  GameMode,
  PlayerState,
  ExitKind,
  InputFrame,
  PlayerId,
  PlayerProfile,
  PlayerResources,
  PlayerCharacter,
} from './types.ts'
import { enterRoom, emit, initialCourses, initialPlayer } from './state.ts'
import { awardLives, setSharedLives } from './lives.ts'

export function startCourse(world: World, course: string, resumeCheckpoint = false) {
  const { state } = world
  if (!state.progress.unlocked.includes(course)) throw new Error('Course is locked')
  state.phase = 'playing'
  delete state.mapClouds
  delete state.heldAtExit
  delete state.mapReveal
  delete state.mapRequest
  delete state.mapReply
  delete state.bonus
  delete state.goalWalk
  delete state.orbFinish
  delete state.keyholeFinish
  state.progress.course = course
  state.progress.selection = state.progress.unlocked.indexOf(course)
  resetMapPlayers(state, course)
  if (!resumeCheckpoint) state.progress.checkpoint = null
  const checkpoint = state.progress.checkpoint
  const intro = !checkpoint && world.campaign.entranceInputs ? world.campaign.levels[course].intro : undefined
  state.entrance = intro
    ? { frame: 0, mounted: Object.fromEntries(activePlayerIds(state).map((id) => [id, state.players[id].mounted])) }
    : null
  state.courseCoins = 0
  state.layerOffsets = {}
  state.onOff = false
  state.silverSwitch = 0
  state.turning = []
  delete state.bouncingBlocks
  delete state.shatteredBlocks
  delete state.questionBonus
  delete state.multicoinUntil
  delete state.rewardRecycle
  delete state.rewardEffects
  state.loadedRooms = []
  delete state.booGroups
  state.entities = []
  state.tileChanges = {}
  state.pSwitch = 0
  state.timeLeft = world.campaign.levels[course].timeLimit ?? 400
  const activePlayers = activePlayerIds(state)
  if (state.mode === 'coop' && !resumeCheckpoint && (state.sharedLives ?? 0) === 0)
    awardLives(state, state.players[activePlayers[0]], 1)
  for (const id of activePlayers) {
    const p = state.players[id]
    if (state.mode !== 'coop' && p.lives === 0 && !resumeCheckpoint) {
      p.lives = 1
      p.form = 'small'
      p.mounted = false
    }
    p.status = state.mode === 'coop'
      ? (state.sharedLives ?? 0) === 0 ? 'spectator' : 'alive'
      : p.lives === 0 ? 'spectator' : 'alive'
    p.timer = 0
    p.star = 0
    p.invincible = 0
    p.mouth = null
    p.tongue = 0
    p.tongueFrame = 0
    delete p.berryBite
    delete p.berryEgg
    delete p.berries
    p.wingTicks = 0
    p.carrying = null
    p.growthPending = false
    p.dragonCoins = 0
    p.height = p.form === 'small' ? 16 : 28
    enterRoom(world, p, checkpoint?.roomId ?? intro ?? course, checkpoint ?? undefined)
  }
  emit(world, 'start')
}
export function createGame(
  campaign: CampaignDefinition,
  save?: CampaignSave | null,
  mode: GameMode = 'coop',
  roster: PlayerProfile[] = mode === 'solo'
    ? [{ id: 'mario', nickname: 'Mario', character: 'mario' }]
    : [
        { id: 'mario', nickname: 'Mario', character: 'mario' },
        { id: 'luigi', nickname: 'Luigi', character: 'luigi' },
      ],
): GameState {
  if (!Object.hasOwn(campaign.levels, campaign.start)) throw new Error('Campaign start room missing')
  if (save && !validateSave(campaign, save)) throw new Error('Invalid campaign save')
  validateRoster(roster)
  const unlocked = initialCourses(campaign)
  const progress = save
    ? structuredClone(save.progress)
    : {
        course: campaign.start,
        unlocked,
        completed: [],
        selection: unlocked.indexOf(campaign.start),
        checkpoint: null,
      }
  const migrated = save ? migrateCampaignSave(save, roster) : undefined
  const savedResources = { ...(migrated?.resources ?? {}) }
  const legacyResources = { ...(migrated?.legacyResources ?? {}) }
  const savedMapPlayers = { ...(migrated?.mapPlayers ?? {}) }
  for (const profile of roster) {
    if (savedResources[profile.id] || !legacyResources[profile.character]) continue
    savedResources[profile.id] = legacyResources[profile.character]!
    delete legacyResources[profile.character]
    const legacyPosition = savedMapPlayers['legacy:' + profile.character]
    if (legacyPosition) {
      savedMapPlayers[profile.id] = legacyPosition
      delete savedMapPlayers['legacy:' + profile.character]
    }
  }
  const players = Object.fromEntries(roster.map((profile) => {
    const player = initialPlayer(profile, progress.course)
    const resource = savedResources[profile.id]
    if (resource) Object.assign(player, resource)
    return [profile.id, player]
  })) as GameState['players']
  const sharedLives = mode === 'coop' ? Math.min(99, migrated?.sharedLives ?? 10) : undefined
  const defaultStop = migrated?.mapStop ?? progress.unlocked[progress.selection]
  const state: GameState = {
    mode,
    ...(sharedLives === undefined ? {} : { sharedLives }),
    tick: 0,
    phase: save?.phase ?? 'map',
    mapPlayers: Object.fromEntries(roster.map((profile) => [
      profile.id,
      { stop: savedMapPlayers[profile.id] ?? defaultStop },
    ])),
    savedMapPlayers,
    savedResources,
    ...(Object.keys(legacyResources).length ? { legacyResources } : {}),
    players,
    entities: [],
    nextEntity: 0,
    loadedRooms: [],
    tileChanges: {},
    progress,
    events: [],
    pSwitch: 0,
    onOff: false,
    layerOffsets: {},
    silverSwitch: 0,
    turning: [],
    courseCoins: 0,
    entrance: null,
    timeLeft: 400,
  }
  if (sharedLives !== undefined) setSharedLives(state, sharedLives)
  const soloOutOfLives = mode === 'solo' && state.players[roster[0].id].lives === 0;
  if (mode === 'coop' && sharedLives === 0)
    for (const id of activePlayerIds(state)) state.players[id].status = 'spectator'
  if (soloOutOfLives && save?.phase === 'playing') state.phase = 'gameOver'
  if (save?.bonus && !soloOutOfLives) resumeBonus({ campaign, state }, save.bonus)
  else if (save?.phase === 'playing' && !soloOutOfLives) {
    startCourse({ campaign, state }, progress.course, true)
    if (mode === 'coop' && sharedLives === 0) {
      for (const id of activePlayerIds(state)) state.players[id].status = 'spectator'
      state.phase = 'gameOver'
    }
  }
  return state
}

export function createGameAtCourse(
  campaign: CampaignDefinition,
  course: string,
  mode: GameMode = 'solo',
): GameState {
  if (!Object.hasOwn(campaign.levels, course)) throw new Error('Unknown course ' + course)
  const directCampaign = { ...campaign, start: course, initial: [course] }
  const state = createGame(directCampaign, undefined, mode)
  startCourse({ campaign: directCampaign, state }, course)
  return state
}

export function finishCourse(
  world: World,
  player: PlayerState,
  kind: ExitKind = 'normal',
  { ending = false, countsAsExit = true, tape }: { ending?: boolean; countsAsExit?: boolean; tape?: GoalAward } = {},
) {
  const { state, campaign } = world
  if (state.phase !== 'playing' || state.bonus) return
  const p = state.progress
  const exitId = p.course + ':' + kind
  const firstClear = !p.completed.includes(exitId)
  const key = ending ? 'ending' : p.course
  const duration = campaign.movieTicks?.[key]
  if (firstClear && duration) state.cutscene = { key, start: state.tick, duration }
  if (!ending && countsAsExit && !p.completed.includes(exitId)) p.completed.push(exitId)
  const paths = campaign.routes[p.course]?.[kind] ?? []
  for (const path of paths) if (campaign.levels[path] && !p.unlocked.includes(path)) p.unlocked.push(path)
  const next = paths.find((id) => p.unlocked.includes(id))
  resetMapPlayers(state, p.course)
  const transitioned = !ending && next ? beginOverworldTravel(world, p.course, next, kind) : false
  if (firstClear && countsAsExit && !ending) {
    const returning = state.mapPlayers[activePlayerIds(state)[0]].travel
    state.mapReveal = { exit: exitId, course: p.course, travel: transitioned && returning ? { ...returning } : undefined }
  }
  if (!transitioned) p.selection = next ? p.unlocked.indexOf(next) : p.unlocked.indexOf(p.course)
  p.checkpoint = null
  state.phase = ending ? 'ending' : 'map'
  if (tape) beginGoalWalk(world, player, tape)
  const event = emit(world, ending ? 'ending' : 'exit', player, kind)
  if (state.goalWalk || state.orbFinish) event.courseClear = true
  if (!ending && countsAsExit && player.bonusStars >= 100) beginBonus(world, player)
}
export function navigate(world: World, inputs: InputFrame) {
  const course = navigateOverworld(world, inputs)
  if (course) startCourse(world, course)
}

export function returnToMap(state: GameState, inputs: InputFrame) {
  if (!activePlayerIds(state).some((id) => inputs[id] & ~state.players[id].lastInput & Buttons.action)) return
  if (state.phase === 'gameOver') {
    state.progress.checkpoint = null
    if (state.mode === 'coop') setSharedLives(state, 10)
    for (const id of activePlayerIds(state)) {
      if (state.mode !== 'coop') state.players[id].lives = 5
      state.players[id].status = 'alive'
    }
  }
  resetMapPlayers(state, state.progress.course)
  delete state.mapClouds
  state.phase = 'map'
}
export function makeSave(state: GameState): CampaignSave {
  const bonus = state.bonus ?? state.goalWalk?.bonus ?? state.orbFinish?.bonus
  const ids = activePlayerIds(state)
  const sharedLives = state.sharedLives ?? Math.min(99, state.players[ids[0]]?.lives ?? 0)
  const resources = (id: PlayerId) => {
    const { form, lives, coins, mounted, yoshiColor, reserve, score, bonusStars } = state.players[id]
    return { form, lives, coins, mounted, yoshiColor, reserve, score, bonusStars }
  }
  const savedResources = { ...(state.savedResources ?? {}) }
  for (const id of ids) savedResources[id] = resources(id)
  const savedMapPlayers = { ...(state.savedMapPlayers ?? {}) }
  if (state.phase === 'map' && !bonus)
    for (const id of ids)
      savedMapPlayers[id] = state.mapPlayers[id].travel?.to ?? state.mapPlayers[id].stop
  return {
    version: 2,
    ...(state.mode === 'coop' ? {
      sharedLives,
      ...(sharedLives === 0
        ? { spectators: ids.filter((id) => state.players[id].status === 'spectator') }
        : {}),
    } : {}),
    ...(state.phase === 'map' && !bonus ? {
      mapPlayers: savedMapPlayers,
    } : {}),
    ...(state.legacyResources && Object.keys(state.legacyResources).length
      ? { legacyResources: structuredClone(state.legacyResources) }
      : {}),
    ...(bonus ? { bonus: structuredClone(bonus) } : {}),
    phase: bonus ? 'playing' : state.phase,
    progress: structuredClone(state.progress),
    resources: savedResources,
  }
}

export function migrateCampaignSave(save: CampaignSave, roster: PlayerProfile[]): CampaignSave {
  if (save.version === 2) return structuredClone(save)
  const resources: Record<PlayerId, PlayerResources> = {}
  const mapPlayers: Record<PlayerId, string> = {}
  const legacyResources: Partial<Record<PlayerCharacter, PlayerResources>> = {}
  for (const character of playerCharacters) {
    const profile = roster.find((candidate) => candidate.character === character)
    const resource = save.resources[character]
    if (profile) resources[profile.id] = structuredClone(resource)
    else legacyResources[character] = structuredClone(resource)
    const position = save.mapPlayers?.[character]
    if (position) mapPlayers[profile?.id ?? 'legacy:' + character] = position
  }
  const previousLives = playerCharacters.reduce((total, character) => total + (save.resources[character]?.lives ?? 0), 0)
  return {
    ...structuredClone(save),
    version: 2,
    sharedLives: save.sharedLives ?? Math.min(99, previousLives),
    resources,
    ...(Object.keys(legacyResources).length ? { legacyResources } : {}),
    ...(Object.keys(mapPlayers).length ? { mapPlayers } : {}),
  }
}

function validateRoster(roster: PlayerProfile[]) {
  if (!Array.isArray(roster) || roster.length < 1 || roster.length > MAX_MULTIPLAYER_PLAYERS)
    throw new Error(`Il roster deve contenere da uno a ${MAX_MULTIPLAYER_PLAYERS} giocatori.`)
  const ids = new Set<string>()
  for (const profile of roster) {
    if (!profile || typeof profile.id !== 'string' || !/^[\w:-]{1,128}$/.test(profile.id))
      throw new Error('Identità del giocatore non valida.')
    if (ids.has(profile.id)) throw new Error('Profilo giocatore duplicato.')
    ids.add(profile.id)
    if (typeof profile.nickname !== 'string' || !profile.nickname.trim() || profile.nickname.trim().length > 24)
      throw new Error('Nickname non valido.')
    if (!playerCharacters.includes(profile.character)) throw new Error('Personaggio non valido.')
  }
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const integer = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max
export function validateSave(campaign: CampaignDefinition, value: unknown): value is CampaignSave {
  if (
    !record(value) ||
    (value.version !== 1 && value.version !== 2) ||
    typeof value.phase !== 'string' ||
    !['playing', 'map', 'ending', 'gameOver'].includes(value.phase)
  )
    return false
  if (value.mapStop !== undefined && (value.phase !== 'map' || typeof value.mapStop !== 'string' ||
    !campaign.overworldPaths || !Object.hasOwn(campaign.overworldPaths, value.mapStop) ||
    Object.hasOwn(campaign.routes, value.mapStop))) return false
  if (value.bonus !== undefined && (value.phase !== 'playing' || !validBonus(value.bonus, campaign.levels)))
    return false
  const p = value.progress,
    members = value.resources
  if (!record(p) || !record(members) || !Array.isArray(p.unlocked) || !Array.isArray(p.completed))
    return false
  const allowed = initialCourses(campaign),
    seen = new Set<string>()
  if (p.completed.length > 1024) return false
  for (const raw of p.completed) {
    if (typeof raw !== 'string' || seen.has(raw)) return false
    const [id, kind, ...extra] = raw.split(':')
    if (extra.length || !allowed.includes(id) || !(kind === 'normal' || kind === 'secret')) return false
    for (const destination of campaign.routes[id]?.[kind] ?? [])
      if (campaign.levels[destination] && !allowed.includes(destination)) allowed.push(destination)
    seen.add(raw)
  }
  if (
    p.unlocked.length !== allowed.length ||
    p.unlocked.some((id, i) => id !== allowed[i]) ||
    typeof p.course !== 'string' ||
    !allowed.includes(p.course) ||
    !integer(p.selection, 0, allowed.length - 1)
  )
    return false
  if (value.mapPlayers !== undefined) {
    if (value.phase !== 'map' || !record(value.mapPlayers)) return false
    const mapPlayers = value.mapPlayers
    const ids = value.version === 1 ? playerIds : Object.keys(mapPlayers)
    if (ids.length > 128 || (value.version === 1 && !playerIds.every((id) => Object.hasOwn(mapPlayers, id))) || !ids.every((id) => {
      const stop = mapPlayers[id]
      if (typeof stop !== 'string') return false
      if (!campaign.overworldPaths) return allowed.includes(stop)
      return Object.hasOwn(campaign.overworldPaths, stop) &&
        (allowed.includes(stop) || !Object.hasOwn(campaign.routes, stop))
    })) return false
  }
  if (value.sharedLives !== undefined && !integer(value.sharedLives, 0, 99)) return false
  if (value.spectators !== undefined && (
    value.sharedLives !== 0 ||
    !Array.isArray(value.spectators) ||
    value.spectators.length > (value.version === 1 ? playerIds.length : 128) ||
    value.spectators.some((id) => typeof id !== 'string' || !id || id.length > 128 ||
      (value.version === 1 && id !== 'mario' && id !== 'luigi')) ||
    new Set(value.spectators).size !== value.spectators.length
  )) return false
  if (p.checkpoint !== null) {
    const point = p.checkpoint
    if (!record(point) || typeof point.roomId !== 'string' || !Object.hasOwn(campaign.levels, point.roomId))
      return false
    const level = campaign.levels[point.roomId]
    if (
      typeof point.x !== 'number' ||
      !Number.isFinite(point.x) ||
      point.x < 0 ||
      point.x >= level.width * 16 ||
      typeof point.y !== 'number' ||
      !Number.isFinite(point.y) ||
      point.y < 0 ||
      point.y >= level.height * 16
    )
      return false
  }
  if (Object.keys(members).length > 128 || (value.version === 1 && !playerIds.every((id) => Object.hasOwn(members, id)))) return false
  if (value.version === 2 && value.legacyResources !== undefined) {
    if (!record(value.legacyResources) || Object.keys(value.legacyResources).some((key) => !playerCharacters.includes(key as PlayerCharacter)))
      return false
    if (!Object.values(value.legacyResources).every(validResources)) return false
  }
  if (value.version === 1 && value.sharedLives !== undefined)
    for (const id of playerIds) {
      const resource = members[id]
      if (!record(resource) || resource.lives !== value.sharedLives) return false
    }
  return Object.values(members).every(validResources)
}

function validResources(value: unknown): value is PlayerResources {
  const r = value
  return (
      record(r) &&
      integer(r.lives, 0, 99) &&
      (r.reserve == null ||
        (typeof r.reserve === 'string' && ['mushroom', 'flower', 'feather'].includes(r.reserve))) &&
      (r.score === undefined || integer(r.score, 0, 9999990)) &&
      (r.bonusStars === undefined || integer(r.bonusStars, 0, 149)) &&
      integer(r.coins, 0, 99) &&
      typeof r.form === 'string' &&
      ['small', 'super', 'fire', 'cape'].includes(r.form) &&
      typeof r.mounted === 'boolean' &&
      (r.yoshiColor === undefined ||
        (typeof r.yoshiColor === 'string' && ['green', 'red', 'blue', 'yellow'].includes(r.yoshiColor)))
  )
}
