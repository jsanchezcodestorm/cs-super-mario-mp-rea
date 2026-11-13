import type { KoopaMotion } from './koopa-motion.ts'
import type { BooStream } from './boo-stream.ts'
import type { LevelNpc } from './level-npcs.ts'
import type { BooGroup } from './boo-clusters.ts'
import type { NetKoopa } from './net-koopa.ts'
import type { StarTrail } from './star-trail.ts'
import type { BonusGame } from './bonus-game.ts'
import type { EmitterCatalog } from './emitters.ts'
import type { GoalWalk } from './goal-walk.ts'
import type { OrbFinish } from './orb-finish.ts'
import type { PlayerAnimation } from './player-animation.ts'
import type { PipePlant } from './pipe-plant.ts'
/** Simulation positions and speeds are expressed in pixels and pixels per 60 Hz tick. */
export interface Point {
  x: number
  y: number
}
export interface EntryPoint extends Point {
  pipe?: 'left' | 'right' | 'up' | 'down'
}
export interface LayerOffset extends Point {
  scrollSpeed?: number
  dx: number
  dy: number
  age: number
  engaged: boolean
}
export interface Body extends Point {
  layer2Ground?: boolean
  width: number
  height: number
  vx: number
  vy: number
  grounded: boolean
}
export interface Spawn extends Point {
  spriteId: number
  extra?: number
  longRope?: boolean
}
export interface Exit {
  screen: number
  target: string
  spawn?: EntryPoint
}
export interface LevelDefinition {
  layerOscillation?: { axis: 'x' | 'y'; start: number; samples: number[] }
  /** Solid Layer 2's world offset per PAL frame during a scripted camera path. */
  layerScrollPath?: [number, number][]
  autoscroll?: [number, number][]
  id: string
  intro?: string
  width: number
  height: number
  tiles: number[]
  spawn: EntryPoint
  sprites: Spawn[]
  exits: Exit[]
  checkpoint?: Point
  tileset?: number
  tide?: 1 | 2
  water?: boolean
  vertical?: boolean
  layer2?: number[]
  specialMode7?: boolean
  timeLimit?: number
}
export type ExitKind = 'normal' | 'secret'
export interface CampaignDefinition {
  emitters?: EmitterCatalog
  movieTicks?: Record<string, number>
  mapLinks?: [string, string][]
  overworldNodes?: Record<string, OverworldNode>
  overworldPaths?: Record<string, OverworldStop>
  start: string
  initial?: string[]
  names?: Record<string, string>
  levels: Record<string, LevelDefinition>
  routes: Record<string, Partial<Record<ExitKind, string[]>>>
  yoshiTraits?: number[]
  capeTargets?: number[]
  slideTargets?: number[]
  lineGuideExits?: { axis: number[]; x: number[]; y: number[] }
  lineGuides?: number[][]
  blockSnakePaths?: number[][]
  entranceInputs?: { onFoot: number[][]; mounted: number[][] }
  slopes?: {
    shape: number[]
    steepShape: number[]
    heights: number[]
    motion: { slide: [number, number] | null; walk: [number, number][] }[]
  }
}
export interface OverworldNode {
  region: number
  x: number
  y: number
}
export type OverworldCommand = 'left' | 'right' | 'up' | 'down' | 'action'
export interface OverworldEdge {
  to: string
  frames: number
  path: [frame: number, region: number, x: number, y: number][]
}
export interface OverworldStop {
  tile: number
  position: [region: number, x: number, y: number]
  directions: Partial<Record<OverworldCommand, OverworldEdge>>
  exitDirections: Record<ExitKind, Exclude<OverworldCommand, 'action'>>
}
export interface MapDeparture { from: string; command: OverworldCommand; departed: number }
export interface OverworldTravel {
  command: OverworldCommand
  from: string
  to: string
  elapsed: number
  duration: number
}
export const playerIds = ['mario', 'luigi'] as const
export type PlayerId = (typeof playerIds)[number]
export type GameMode = 'solo' | 'coop'
export const Buttons = {
  left: 1,
  right: 2,
  up: 4,
  down: 8,
  jump: 16,
  run: 32,
  spin: 64,
  action: 128,
  reserve: 256,
} as const
export type ButtonMask = number
export type InputFrame = Record<PlayerId, ButtonMask>
export type ReserveItem = 'mushroom' | 'flower' | 'feather'
export type PowerForm = 'small' | 'super' | 'cape' | 'fire'
export type YoshiColor = 'green' | 'red' | 'yellow' | 'blue'
export type BerryTile = 0x45 | 0x46 | 0x47
export interface YoshiMouth {
  kind: EntityKind | 'berry'
  spriteId: number
  entityId?: string
  berry?: BerryTile
  caughtFrame?: number
  shellColor?: YoshiColor
  rainbow?: boolean
  ticks: number
}
export interface PlayerState extends Body {
  ropeId?: string
  ropeReleased?: number
  netClinging?: boolean
  behindNet?: boolean
  netPunchTick?: number
  netTurn?: Point & { tick: number; roomId: string; offsetX: number; fromBehind: boolean }
  death?: { y: number; tick: number; duration: number }
  starTrail?: StarTrail
  formChange?: { from: PowerForm; to: PowerForm; tick: number }
  animation?: PlayerAnimation
  berryBite?: { roomId: string; col: number; row: number; tile: BerryTile; tick: number }
  berries?: { red: number; pink: number }
  berryEgg?: { spriteId: 0x74 | 0x6a; tick: number }
  pipeExit?: Point & { direction: NonNullable<EntryPoint['pipe']>; tick: number; frames: number }
  capeReady?: number
  cloud?: string
  ducking?: boolean
  growthPending?: boolean
  wallRun?: -1 | 1
  sliding?: { speed: number; sixths: number }
  reserve: ReserveItem | null
  score: number
  bonusStars: number
  scrollClock?: number
  id: PlayerId
  roomId: string
  lives: number
  form: PowerForm
  status: 'alive' | 'dead' | 'spectator'
  facing: 1 | -1
  coins: number
  dragonCoins: number
  mounted: boolean
  yoshiColor: YoshiColor
  mouth: YoshiMouth | null
  tongue: number
  wingTicks: number
  tongueFrame: number
  invincible: number
  star: number
  spin: boolean
  blockRebound?: true
  timer: number
  lastInput: number
  carrying: string | null
  cooldown: number
  runTicks: number
  flight: number
  balloon: number
}
export type EntityKind =
  | 'levelNpc'
  | 'flyingQuestion'
  | 'lakitu'
  | 'cloud'
  | 'koopa'
  | 'netKoopa'
  | 'pipeDecoy'
  | 'magikoopa'
  | 'magic'
  | 'walker'
  | 'rex'
  | 'shell'
  | 'spiny'
  | 'jumper'
  | 'flyer'
  | 'boo'
  | 'fish'
  | 'plant'
  | 'bullet'
  | 'platform'
  | 'ropeMotor'
  | 'spring'
  | 'switch'
  | 'hazard'
  | 'key'
  | 'keyhole'
  | 'goal'
  | 'orb'
  | 'mushroom'
  | 'flower'
  | 'feather'
  | 'star'
  | 'oneUp'
  | 'babyYoshi'
  | 'yoshiEgg'
  | 'yoshiFire'
  | 'yoshi'
  | 'coin'
  | 'coinGameCloud'
  | 'cloudCoin'
  | 'fireball'
  | 'boss'
  | 'endingBoss'
  | 'mechakoopa'
  | 'mechaShell'
  | 'chuck'
  | 'chuckShot'
  | 'blockSnake'
  | 'directionalCoins'
  | 'vine'
  | 'balloon'
  | 'throwBlock'
  | 'switchPalace'
  | 'exitSide'
export interface EntityState extends Body {
  booStream?: BooStream
  resident?: LevelNpc
  koopa?: KoopaMotion
  netKoopa?: NetKoopa
  pipePlant?: PipePlant
  coinGame?: { attempts: number; collected: number }
  sourceCloud?: string
  coinBounced?: boolean
  eggPrize?: 0x74 | 0x6a
  blockReleaseTick?: number
  questionFlight?: { xSpeed: number; ySpeed: number; ax: number; ay: number; hold: number }
  questionHit?: { tick: number; playerId: PlayerId | null; paid: boolean }
  shellChain?: number
  coinDirection?: number
  coinTurn?: number
  shellKnockedOut?: boolean
  /** World direction used by the NPC's drawing routine, including pauses and turns. */
  facing?: -1 | 1
  boo?: { watching: boolean; check: number; turn: number; wait: number; peek: number; pose: number }
  bracedBy?: string
  fromEnemyBlock?: boolean
  baitTaken?: true
  lastThrowFrame?: number
  lakituCoin?: boolean
  shellKickTick?: number
  shellDefense?: { id: string; facing: 1 | -1; wait: number }
  tossed?: boolean
  eerieAcceleration?: number
  raftX?: number
  scale?: import('./scale-platforms.ts').ScalePair
  riderTick?: number
  chainPhase?: number
  liftTimer?: number
  liftStep?: number
  liftReverse?: boolean
  liftWet?: boolean
  deckRider?: PlayerId
  platformStarted?: number
  pickupDelay?: number
  pipeOffset?: number
  reserveDrop?: boolean
  emission?: { c2: number; facing: number }
  yoshiColor?: YoshiColor
  yoshiGrowthTick?: number
  yoshiRunning?: boolean
  shellColor?: YoshiColor
  rainbow?: boolean
  meals?: number
  hatchAt?: number
  adultEgg?: boolean
  bonusPrize?: boolean
  swing?: { angle: number; speed: number }
  id: string
  roomId: string
  kind: EntityKind
  active: boolean
  spriteId: number
  origin: Point
  age: number
  hp: number
  owner: PlayerId | null
  hurtAt?: number
  bossTurnTick?: number
  stunnedUntil?: number
  split?: boolean
  projectile?: 'rock' | 'football' | 'baseball'
  railFlight?: { vx: number; vy: number; hold: number }
  rail?: { col: number; row: number; tile: number; direction: 1 | -1; step: number }
  snake?: { eater: boolean; started: boolean; command: number; remaining: number; direction: number }
  secret: boolean
}
export interface CampaignProgress {
  course: string
  unlocked: string[]
  completed: string[]
  checkpoint: (Point & { roomId: string }) | null
  selection: number
}
export interface CampaignSave {
  mapStop?: string
  bonus?: BonusGame
  version: 1
  progress: CampaignProgress
  resources: Record<
    PlayerId,
    {
      lives: number
      form: PowerForm
      coins: number
      mounted: boolean
      yoshiColor?: YoshiColor
      reserve?: ReserveItem | null
      score?: number
      bonusStars?: number
    }
  >
  phase: 'playing' | 'map' | 'ending' | 'gameOver'
}
export type HitAward = 10 | 100 | 200 | 400 | 800 | 1000 | 2000 | 4000 | 8000 | '1up'
export interface RewardEffect extends Point {
  roomId: string
  tick: number
  award: HitAward
  coinSlot?: number
  scoreSlot?: number
  fromBlock?: boolean
}
export interface BlockBounce {
  replacement?: number
  roomId: string
  col: number
  row: number
  tile: number
  tick: number
}
export interface GameEvent {
  award?: HitAward
  chain?: number
  type:
    | 'tongue'
    | 'spit'
    | 'swallow'
    | 'yoshiStomp'
    | 'yoshiGrow'
    | 'jump'
    | 'coin'
    | 'item'
    | 'shellHit'
    | 'stomp'
    | 'hurt'
    | 'death'
    | 'checkpoint'
    | 'exit'
    | 'pipe'
    | 'start'
    | 'block'
    | 'shatter'
    | 'switch'
    | 'shot'
    | 'ending'
    | 'gameOver'
  tick: number
  playerId?: PlayerId
  roomId?: string
  exit?: ExitKind
  keyhole?: true
  courseClear?: true
}
export interface NetDoor extends Point { roomId: string; tick: number; players: PlayerId[] }
export interface GameState {
  booGroups?: Record<string, BooGroup[]>
  spriteSeed?: number
  heldAtExit?: InputFrame
  goalWalk?: GoalWalk
  orbFinish?: OrbFinish
  keyholeFinish?: { tick: number; finisher: PlayerId; x: number; y: number }
  netDoors?: NetDoor[]
  questionBonus?: { roomId: string; closed: boolean }
  mode?: GameMode
  bonus?: BonusGame
  cutscene?: { key: string; start: number; duration: number }
  mapStop?: string
  mapClouds?: ({ x: number; y: number; z: number } | null)[]
  mapArrival?: MapDeparture & { previous?: MapDeparture }
  mapTravel?: OverworldTravel
  mapReveal?: { exit: string; course: string; start?: number; travel?: OverworldTravel }
  tick: number
  phase: CampaignSave['phase']
  players: Record<PlayerId, PlayerState>
  entities: EntityState[]
  nextEntity: number
  loadedRooms: string[]
  tileChanges: Record<string, Record<number, number>>
  progress: CampaignProgress
  events: GameEvent[]
  pSwitch: number
  layerOffsets: Record<string, LayerOffset>
  onOff: boolean
  silverSwitch: number
  turning: { roomId: string; col: number; row: number; until: number }[]
  courseCoins: number
  entrance: { frame: number; mounted: Record<PlayerId, boolean> } | null
  timeLeft: number
  rewardEffects?: RewardEffect[]
  rewardRecycle?: Record<string, Partial<Record<'coinSlot' | 'scoreSlot', number>>>
  bouncingBlocks?: BlockBounce[]
  shatteredBlocks?: (Point & { roomId: string; tick: number; firstSlot: number })[]
  multicoinUntil?: Record<string, number>
}
const soloPlayerIds = ['mario'] as const
export function activePlayerIds(state: Pick<GameState, 'mode'>): readonly PlayerId[] {
  return state.mode === 'solo' ? soloPlayerIds : playerIds
}
export type World = { campaign: CampaignDefinition; state: GameState }
