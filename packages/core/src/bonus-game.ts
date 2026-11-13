import type { World, PlayerState, PlayerId } from './types.ts'
import { activePlayerIds, playerIds } from './types.ts'
import { emit, enterRoom, spawnEntity } from './state.ts'

export interface BonusSlot {
  x: number
  y: number
  frame: number
  symbol: number
  stopped: boolean
  winning: boolean
}
export interface BonusGame {
  roomId: string
  owner: PlayerId
  age: number
  clock: number
  slots: BonusSlot[]
  result: number | null
  remaining: number
  waitingToDrop: number
  exitTimer: number
}

const lines = [
  [0, 1, 2],
  [2, 3, 4],
  [4, 5, 6],
  [6, 7, 0],
  [0, 8, 4],
  [2, 8, 6],
  [3, 8, 7],
  [1, 8, 5],
]
const origins = [
  [80, 240],
  [160, 240],
  [160, 320],
  [80, 320],
]
const direction = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]
function slotPosition(index: number, age: number) {
  if (index === 8) return { x: 120, y: 280 }
  const distance = (index * 40 + age) % 320,
    edge = Math.floor(distance / 80),
    step = distance % 80
  return { x: origins[edge][0] + direction[edge][0] * step, y: origins[edge][1] + direction[edge][1] * step }
}
function movePlayers(world: World, bonus: BonusGame) {
  const level = world.campaign.levels[bonus.roomId]
  world.state.phase = 'playing'
  world.state.timeLeft = 0
  world.state.pSwitch = world.state.silverSwitch = 0
  world.state.loadedRooms = []
  delete world.state.booGroups
  world.state.entities = []
  world.state.tileChanges = {}
  world.state.turning = []
  delete world.state.shatteredBlocks
  const activePlayers = activePlayerIds(world.state)
  for (const id of playerIds) {
    const p = world.state.players[id]
    if (!activePlayers.includes(id)) {
      p.status = 'spectator'
      continue
    }
    p.status = p.lives > 0 || (world.state.mode === 'coop' && p.status !== 'spectator') ? 'alive' : 'spectator'
    p.height = p.form === 'small' ? 16 : 28
    p.carrying = null
    p.mouth = null
    p.tongue = 0
    p.tongueFrame = 0
    enterRoom(world, p, bonus.roomId, { x: level.spawn.x + 2, y: level.spawn.y + 32 })
  }
  world.state.bonus = bonus
}
export function beginBonus(world: World, p: PlayerState) {
  if (p.bonusStars < 100) return
  const roomId = parseInt(world.state.progress.course, 16) >= 0x100 ? '100' : '000'
  if (!world.campaign.levels[roomId]) throw new Error('Missing bonus room ' + roomId)
  p.bonusStars -= 100
  const seed = world.state.tick
  const slots = Array.from({ length: 9 }, (_, i) => {
    const stopped = i === 8
    const frame = stopped ? 1 + 3 * Math.floor(((seed ^ (seed >> 5)) & 7) / 3) : (seed + i + 1) & 7
    return { ...slotPosition(i, 0), frame, symbol: Math.floor(frame / 3), stopped, winning: false }
  })
  const bonus: BonusGame = {
    roomId,
    owner: p.id,
    age: 0,
    clock: world.state.tick % 64,
    slots,
    result: null,
    remaining: 0,
    waitingToDrop: 0,
    exitTimer: 0,
  }
  const closing = world.state.goalWalk ?? world.state.orbFinish
  if (closing) closing.bonus = bonus
  else movePlayers(world, bonus)
}
function stopSlot(world: World, p: PlayerState, previousY: number, slots: BonusSlot[]) {
  if (p.status !== 'alive' || p.vy >= 0) return
  for (const slot of slots) {
    const bottom = slot.y + 16
    if (
      slot.stopped ||
      p.x + p.width <= slot.x ||
      p.x >= slot.x + 16 ||
      previousY < bottom - 2 ||
      p.y > bottom
    )
      continue
    slot.stopped = true
    slot.frame = slot.symbol * 3 + 1
    p.y = bottom
    p.vy = 1
    emit(world, 'switch', p)
    return
  }
}
export function resolveBonus(bonus: BonusGame) {
  const ordered = bonus.slots.slice().sort((a, b) => a.y - b.y || a.x - b.x)
  // The comparison table in bank 01 indexes the outside ring clockwise, followed by the center.
  const board = [
    ordered[0],
    ordered[1],
    ordered[2],
    ordered[5],
    ordered[8],
    ordered[7],
    ordered[6],
    ordered[3],
    ordered[4],
  ]
  let wins = 0
  for (const [a, b, c] of lines) {
    if (board[a].symbol !== board[b].symbol || board[a].symbol !== board[c].symbol) continue
    board[a].winning = board[b].winning = board[c].winning = true
    wins++
  }
  bonus.result = wins
  bonus.remaining = wins
  bonus.waitingToDrop = wins
  bonus.exitTimer = wins ? 0 : 88
}
export function collectedBonusLife(world: World) {
  const bonus = world.state.bonus
  if (bonus && --bonus.remaining === 0) bonus.exitTimer = 88
}
function dropLife(world: World, bonus: BonusGame) {
  const reward = spawnEntity(world, bonus.roomId, { x: 24, y: 256, spriteId: 0x78 })!
  reward.bonusPrize = true
  reward.vx = 1
  reward.vy = 1
}
export function stepBonus(world: World, tops: Record<PlayerId, number>) {
  const bonus = world.state.bonus
  if (!bonus) return
  bonus.age++
  if (bonus.result !== null) {
    if (bonus.exitTimer && --bonus.exitTimer === 0) {
      delete world.state.bonus
      world.state.phase = 'map'
      return
    }
    if (bonus.waitingToDrop && ((bonus.age + bonus.clock) & 63) === 0) {
      bonus.waitingToDrop--
      dropLife(world, bonus)
    }
    return
  }
  for (let i = 0; i < 9; i++) {
    const slot = bonus.slots[i]
    Object.assign(slot, slotPosition(i, bonus.age))
    if (!slot.stopped && ((bonus.age + bonus.clock) & 3) === 0) {
      slot.frame = (slot.frame + 1) % 9
      slot.symbol = Math.floor(slot.frame / 3)
    }
  }
  for (const id of activePlayerIds(world.state)) stopSlot(world, world.state.players[id], tops[id], bonus.slots)
  if (bonus.age % 40 === 0 && bonus.slots.every((slot) => slot.stopped)) resolveBonus(bonus)
}
export function resumeBonus(world: World, bonus: BonusGame) {
  const saved = structuredClone(bonus)
  movePlayers(world, saved)
  for (let i = 0; i < saved.remaining - saved.waitingToDrop; i++) dropLife(world, saved)
}
const numberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
export function validBonus(data: unknown, levels: World['campaign']['levels']): data is BonusGame {
  if (!data || typeof data !== 'object') return false
  const b = data as BonusGame
  if (
    !['000', '100'].includes(b.roomId) ||
    !levels[b.roomId] ||
    !playerIds.includes(b.owner) ||
    !numberIn(b.age, 0, 1e9) ||
    !Array.isArray(b.slots) ||
    b.slots.length !== 9
  )
    return false
  if (!numberIn(b.clock, 0, 63) || (b.result !== null && !numberIn(b.result, 0, 8))) return false
  if (
    !numberIn(b.remaining, 0, b.result ?? 0) ||
    !numberIn(b.waitingToDrop, 0, b.remaining) ||
    !numberIn(b.exitTimer, 0, 88)
  )
    return false
  const valid = b.slots.every((slot, i) => {
    if (!slot || !numberIn(slot.frame, 0, 8) || slot.symbol !== Math.floor(slot.frame / 3)) return false
    if (typeof slot.stopped !== 'boolean' || typeof slot.winning !== 'boolean' || (i === 8 && !slot.stopped))
      return false
    if (!numberIn(slot.x, 80, 160) || !numberIn(slot.y, 240, 320)) return false
    if (b.result !== null) return slot.stopped && (slot.x - 80) % 40 === 0 && (slot.y - 240) % 40 === 0
    const position = slotPosition(i, b.age)
    return slot.x === position.x && slot.y === position.y
  })
  if (!valid || b.result === null) return valid
  if (new Set(b.slots.map((s) => s.x + ',' + s.y)).size !== 9) return false
  const computed = structuredClone(b)
  resolveBonus(computed)
  return computed.result === b.result && (b.remaining !== 0 || b.exitTimer > 0)
}
