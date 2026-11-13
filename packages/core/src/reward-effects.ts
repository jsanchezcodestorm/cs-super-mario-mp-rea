import { palFrame } from './pal-time.ts'
import type { GameState, RewardEffect } from './types.ts'

const coinLife = 26
const scoreLife = 48

/** The four popping coins and six score objects have independent OAM slots per room. */
function allocate(state: GameState, effects: RewardEffect[], next: RewardEffect, field: 'coinSlot' | 'scoreSlot', count: number) {
  const active = effects.filter(e => e !== next && e.roomId === next.roomId && e[field] !== undefined)
  for (let slot = count - 1; slot >= 0; slot--)
    if (!active.some(e => e[field] === slot)) return slot
  // E1 decrements CoinSpriteSlotIdx / ScoreSpriteSlotIdx only on overflow.
  const byRoom = state.rewardRecycle ??= {}
  const cursor = byRoom[next.roomId] ??= {}
  const recycled = ((cursor[field] ?? 0) + count - 1) % count
  cursor[field] = recycled
  const previous = active.find(e => e[field] === recycled)!
  delete previous[field]
  return recycled
}

export function addRewardEffect(state: GameState, effect: RewardEffect) {
  const effects = state.rewardEffects ??= []
  if (effect.fromBlock) effect.coinSlot = allocate(state, effects, effect, 'coinSlot', 4)
  else effect.scoreSlot = allocate(state, effects, effect, 'scoreSlot', 6)
  effects.push(effect)
}

export function advanceRewardEffects(state: GameState) {
  if (!state.rewardEffects?.length) return
  const now = palFrame(state.tick)
  const age = (e: RewardEffect) => now - palFrame(e.tick)
  const effects = state.rewardEffects = state.rewardEffects.filter(e => age(e) < scoreLife + (e.fromBlock ? coinLife + 1 : 0))
  for (const e of effects) {
    if (e.coinSlot === undefined || age(e) < coinLife) continue
    delete e.coinSlot
    e.scoreSlot = allocate(state, effects, e, 'scoreSlot', 6)
  }
}
