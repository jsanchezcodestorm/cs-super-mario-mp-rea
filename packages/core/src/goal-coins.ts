import type { EntityState, PlayerState, World } from './types.ts'
import { playerViewport } from './autoscroll.ts'
import { addScore } from './rewards.ts'

/** x is screen-relative while status 06 is active, y remains in level coordinates. */
export interface GoalCoins {
  sprites: { x: number; y: number }[]
  popups: { sprite: number; type: number; slot: number }[]
  scoreGain: number
  coinsBefore: number
  livesBefore: number
  extraCoins: number
  extraLives: number
  popupCamera?: number
}

// E1 $07:F659 bit 1 keeps these sprites when the trigger would erase them.
const retained = new Set([0x35, 0x6d, 0x7b, 0x7c, 0xc0, 0xc6])
const extended = new Set<EntityState['kind']>(['fireball', 'yoshiFire', 'chuckShot', 'cloudCoin'])
// GivePoints adds five to min(2*index,13). The last two coin-score objects
// also read the bytes following PointMultiplierHi in E1.
const scoreByType: Record<number, number> = { 5: 100, 7: 400, 9: 1000, 11: 4000, 13: 0, 15: 0, 17: 7680, 18: 2560 }

function convertTargets(world: World, finisher: PlayerState, tape: EntityState, cut: boolean) {
  const room = world.campaign.levels[tape.roomId]
  const camera = playerViewport(room, finisher)
  const sprites: GoalCoins['sprites'] = []
  for (const e of world.state.entities) {
    if (!e.active || e.roomId !== tape.roomId) continue
    if (e.owner && world.state.players[e.owner].carrying === e.id) continue // status 0B has its own handler
    if (extended.has(e.kind)) { e.active = false; continue }
    if (e.kind === 'goal' && cut && e === tape) continue
    const x = Math.floor(e.x) - camera.x, y = Math.floor(e.y) - camera.y
    const visible = x >= 0 && x < 256 && y + 16 >= 0 && y < 256
    const forcedTape = !cut && e === tape
    const traits = world.campaign.yoshiTraits?.[e.spriteId]
    if (forcedTape || (visible && traits !== undefined && !(traits & 0x20))) {
      if (sprites.length < 12) sprites.push({ x, y: Math.floor(e.y) })
      e.active = false
    } else if (!retained.has(e.spriteId)) e.active = false
  }
  return sprites
}

/** Commit now so skipping, saving, rejoining or entering the bonus room yields the same resources. */
export function settleGoalCoins(world: World, finisher: PlayerState, tape: EntityState, cut: boolean): GoalCoins | undefined {
  const sprites = convertTargets(world, finisher, tape, cut)
  if (!sprites.length) return
  const slots: GoalCoins['popups'] = []
  // Score objects last 48 PAL frames. Existing ones have expired before these
  // are created at frame 55. On overflow the native allocator recycles downward.
  let recycle = world.state.rewardRecycle?.[tape.roomId]?.scoreSlot ?? 0
  for (let i = 0; i < sprites.length; i++) {
    let slot = 5 - i
    if (slot < 0) { recycle = (recycle + 5) % 6; slot = recycle }
    slots[slot] = { sprite: i, type: Math.min(18, 5 + 2 * i), slot }
  }
  const popups = slots.filter(Boolean)
  const scoreGain = popups.reduce((n, p) => n + scoreByType[p.type], 0)
  const extraCoins = popups.reduce((n, p) => n + (p.type === 17 ? 5 : p.type === 18 ? 10 : 0), 0)
  const extraLives = popups.reduce((n, p) => n + (p.type === 13 ? 1 : p.type === 15 ? 3 : 0), 0)
  const { coins: coinsBefore, lives: livesBefore } = finisher
  const coins = sprites.length + extraCoins
  world.state.courseCoins += coins
  finisher.coins = (coinsBefore + coins) % 100
  finisher.lives = Math.min(99, livesBefore + extraLives + Math.floor((coinsBefore + coins) / 100))
  addScore(finisher, scoreGain)
  return { sprites, popups, scoreGain, extraCoins, extraLives, coinsBefore, livesBefore }
}

export function goalCoinHud(bonus: GoalCoins, age: number) {
  const count = Math.min(bonus.sprites.length + bonus.extraCoins, Math.max(0, age - 55))
  const coins = bonus.coinsBefore + count
  // $18E4 hands out each life separately from the score object.
  const extra = age < 62 ? 0 : Math.min(bonus.extraLives, 1 + Math.floor((age - 62) / 36))
  return { coins: coins % 100, lives: Math.min(99, bonus.livesBefore + Math.floor(coins / 100) + extra) }
}
