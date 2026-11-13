import { addRewardEffect } from './reward-effects.ts'
import type { World, PlayerState, EntityState, ReserveItem, HitAward, GameState, RewardEffect } from './types.ts'
import { spawnEntity } from './state.ts'
import { scrollingCamera } from './autoscroll.ts'
import { limit } from './terrain.ts'
import { awardLives } from './lives.ts'
import { palFrame } from './pal-time.ts'

const reserveForForm = { small: null, super: 'mushroom', fire: 'flower', cape: 'feather' } as const
const spriteForReserve = { mushroom: 0x74, flower: 0x75, feather: 0x77 } as const

export function addScore(p: PlayerState, amount: number) {
  p.score = Math.min(9999990, p.score + amount)
}

function claimImpactSlot(state: GameState, roomId: string) {
  const frame = palFrame(state.tick)
  const live = (state.rewardEffects ?? []).filter(e => e.roomId === roomId && e.impactSlot !== undefined && frame - palFrame(e.tick) <= 8)
  // Smoke $02 takes the highest free slot and overwrites slot zero on overflow.
  for (let slot = 3; slot >= 0; slot--)
    if (!live.some(e => e.impactSlot === slot)) return slot
  delete live.find(e => e.impactSlot === 0)!.impactSlot
  return 0
}

export function showHitAward(state: GameState, player: PlayerState, target: Pick<EntityState, 'roomId' | 'x' | 'y'>, amount: HitAward, impact = false) {
  if (amount === '1up') awardLives(state, player, 1)
  else addScore(player, amount)
  const effect: RewardEffect = { tick: state.tick, roomId: target.roomId, x: target.x, y: target.y - 8, award: amount }
  if (impact) effect.impactSlot = claimImpactSlot(state, target.roomId)
  addRewardEffect(state, effect)
}

/** E1 ItemBoxSprite indexes the newly touched item and the previous form. */
export function storePowerup(p: PlayerState, item: ReserveItem) {
  if (p.form === 'small') return
  p.reserve = item === 'mushroom' ? 'mushroom' : reserveForForm[p.form]
}

export function releaseReserve(world: World, p: PlayerState) {
  if (!p.reserve || p.status !== 'alive') return
  const room = world.campaign.levels[p.roomId]
  const camera = scrollingCamera(room, p.scrollClock ?? 0) ?? {
    x: limit(p.x + p.width / 2 - 128, 0, Math.max(0, room.width * 16 - 256)),
    y: limit(p.y + p.height / 2 - 123, 0, Math.max(0, room.height * 16 - 224)),
  }
  const item = spawnEntity(world, room.id, {
    spriteId: spriteForReserve[p.reserve],
    x: camera.x + 120,
    y: camera.y + 28,
  })
  if (item) {
    item.reserveDrop = true
    item.vx = 0
    item.vy = 1
    p.reserve = null
  }
}

export function moveTape(e: EntityState) {
  // E1 01:C0A5 moves one pixel per frame and reverses every 124 frames.
  const phase = e.age % 248
  e.y = e.origin.y - (phase < 124 ? phase : 248 - phase)
}

export function goalReward(world: World, p: PlayerState, e: EntityState) {
  const tape = e.y + 8
  if (p.y + p.height >= tape && p.y < tape + 8) {
    const band = Math.min(31, Math.floor((e.origin.y - e.y) / 4))
    const stars = band < 30 ? band + 1 : band === 30 ? 40 : 50
    p.bonusStars += stars
    if (stars === 50) awardLives(world.state, p, 3)
  }
  addScore(p, world.state.timeLeft * 50)
}
