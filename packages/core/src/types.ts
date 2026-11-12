import type { BonusGame } from './bonus-game.ts'
import type { EmitterCatalog } from './emitters.ts'
/** Simulation positions and speeds are expressed in pixels and pixels per 60 Hz tick. */
export interface Point {
  x: number
  y: number
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
}
export interface Exit {
  screen: number
  target: string
  spawn?: Point
}
export interface LevelDefinition {
  layerOscillation?: { axis: 'x' | 'y'; start: number; samples: number[] }
  autoscroll?: [number, number][]
  id: string
  intro?: string
  width: number
  height: number
  tiles: number[]
  spawn: Point
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
export interface YoshiMouth {
  kind: EntityKind
  spriteId: number
  shellColor?: YoshiColor
  rainbow?: boolean
  ticks: number
}
export interface PlayerState extends Body {
  capeReady?: number
  cloud?: string
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
  timer: number
  lastInput: number
  carrying: string | null
  cooldown: number
  runTicks: number
  flight: number
  balloon: number
}
export type EntityKind =
  | 'lakitu'
  | 'cloud'
  | 'koopa'
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
  coinDirection?: number
  coinTurn?: number
  tossed?: boolean
  eerieAcceleration?: number
  raftX?: number
  chainPhase?: number
  platformStarted?: number
  pickupDelay?: number
  pipeOffset?: number
  reserveDrop?: boolean
  emission?: { c2: number; facing: number }
  yoshiColor?: YoshiColor
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
  stunnedUntil?: number
  split?: boolean
  projectile?: 'rock' | 'football' | 'baseball'
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
export interface GameEvent {
  type:
    | 'tongue'
    | 'spit'
    | 'swallow'
    | 'yoshiStomp'
    | 'yoshiGrow'
    | 'jump'
    | 'coin'
    | 'item'
    | 'stomp'
    | 'hurt'
    | 'death'
    | 'checkpoint'
    | 'exit'
    | 'pipe'
    | 'start'
    | 'block'
    | 'switch'
    | 'shot'
    | 'ending'
    | 'gameOver'
  tick: number
  playerId?: PlayerId
  roomId?: string
  exit?: ExitKind
}
export interface GameState {
  mode?: GameMode
  bonus?: BonusGame
  cutscene?: { key: string; start: number; duration: number }
  mapStop?: string
  mapTravel?: OverworldTravel
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
}
const soloPlayerIds = ['mario'] as const
export function activePlayerIds(state: Pick<GameState, 'mode'>): readonly PlayerId[] {
  return state.mode === 'solo' ? soloPlayerIds : playerIds
}
export type World = { campaign: CampaignDefinition; state: GameState }
