import { beginBonus, resumeBonus, validBonus } from './bonus-game.ts'
import { beginGoalWalk, type GoalAward } from './goal-walk.ts'
import { activePlayerIds, Buttons, playerIds } from './types.ts'
import { beginOverworldTravel, navigateOverworld } from './overworld.ts'
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
} from './types.ts'
import { enterRoom, emit, initialCourses, initialPlayer } from './state.ts'

export function startCourse(world: World, course: string, resumeCheckpoint = false) {
  const { state } = world
  if (!state.progress.unlocked.includes(course)) throw new Error('Course is locked')
  state.phase = 'playing'
  delete state.mapClouds
  delete state.mapArrival
  delete state.mapStop
  delete state.mapTravel
  delete state.heldAtExit
  delete state.mapReveal
  delete state.bonus
  delete state.goalWalk
  delete state.orbFinish
  delete state.keyholeFinish
  state.progress.course = course
  state.progress.selection = state.progress.unlocked.indexOf(course)
  if (!resumeCheckpoint) state.progress.checkpoint = null
  const checkpoint = state.progress.checkpoint
  const intro = !checkpoint && world.campaign.entranceInputs ? world.campaign.levels[course].intro : undefined
  state.entrance = intro
    ? { frame: 0, mounted: { mario: state.players.mario.mounted, luigi: state.players.luigi.mounted } }
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
  state.entities = []
  state.tileChanges = {}
  state.pSwitch = 0
  state.timeLeft = world.campaign.levels[course].timeLimit ?? 400
  const activePlayers = activePlayerIds(state)
  for (const id of playerIds) {
    const p = state.players[id]
    if (!activePlayers.includes(id)) {
      p.status = 'spectator'
      continue
    }
    if (p.lives === 0 && !resumeCheckpoint) {
      p.lives = 1
      p.form = 'small'
      p.mounted = false
    }
    p.status = p.lives === 0 ? 'spectator' : 'alive'
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
): GameState {
  if (!Object.hasOwn(campaign.levels, campaign.start)) throw new Error('Campaign start room missing')
  if (save && !validateSave(campaign, save)) throw new Error('Invalid campaign save')
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
  const players = {
    mario: initialPlayer('mario', progress.course),
    luigi: initialPlayer('luigi', progress.course),
  }
  if (save)
    for (const id of playerIds) {
      const { lives, coins, form, mounted, yoshiColor, reserve, score, bonusStars } = save.resources[id]
      const player = players[id]
      Object.assign(player, { lives, coins, form, mounted })
      if (yoshiColor !== undefined) player.yoshiColor = yoshiColor
      if (reserve !== undefined) player.reserve = reserve
      if (score !== undefined) player.score = score
      if (bonusStars !== undefined) player.bonusStars = bonusStars
    }
  const state: GameState = {
    mode,
    tick: 0,
    phase: save?.phase ?? 'map',
    ...(save?.mapStop ? { mapStop: save.mapStop } : {}),
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
  const soloOutOfLives = mode === 'solo' && state.players.mario.lives === 0;
  if (mode === 'solo') state.players.luigi.status = 'spectator'
  if (soloOutOfLives && save?.phase === 'playing') state.phase = 'gameOver'
  if (save?.bonus && !soloOutOfLives) resumeBonus({ campaign, state }, save.bonus)
  else if (save?.phase === 'playing' && !soloOutOfLives) startCourse({ campaign, state }, progress.course, true)
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
  const transitioned = !ending && next ? beginOverworldTravel(world, p.course, next, kind) : false
  if (firstClear && countsAsExit && !ending) {
    state.mapReveal = { exit: exitId, course: p.course, travel: transitioned ? { ...state.mapTravel! } : undefined }
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
    for (const id of activePlayerIds(state)) {
      state.players[id].lives = 5
      state.players[id].status = 'alive'
    }
  }
  state.phase = 'map'
}
export function makeSave(state: GameState): CampaignSave {
  const bonus = state.bonus ?? state.goalWalk?.bonus ?? state.orbFinish?.bonus
  const resources = (id: PlayerId) => {
    const { form, lives, coins, mounted, yoshiColor, reserve, score, bonusStars } = state.players[id]
    return { form, lives, coins, mounted, yoshiColor, reserve, score, bonusStars }
  }
  return {
    version: 1,
    ...(state.mapStop ? { mapStop: state.mapStop } : {}),
    ...(bonus ? { bonus: structuredClone(bonus) } : {}),
    phase: bonus ? 'playing' : state.phase,
    progress: structuredClone(state.progress),
    resources: { mario: resources('mario'), luigi: resources('luigi') },
  }
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const integer = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max
export function validateSave(campaign: CampaignDefinition, value: unknown): value is CampaignSave {
  if (
    !record(value) ||
    value.version !== 1 ||
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
  return playerIds.every((id) => {
    const r = members[id]
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
  })
}
