import { collectedBonusLife } from './bonus-game.ts'
import { changePlayerForm, expandPlayer } from './player-size.ts'
import { collectCoin } from './resources.ts'
import { showHitAward, storePowerup } from './rewards.ts'
import { emit } from './state.ts'
import type { EntityState, PlayerState, World } from './types.ts'

const pickups = new Set(['mushroom', 'flower', 'star', 'feather', 'oneUp', 'coin'])

/** E1 01:C4BF is entered both by Mario contact and by the swallowing routine. */
export function takeItem(world: World, e: EntityState, p: PlayerState) {
  if (!pickups.has(e.kind)) return false
  e.active = false
  if (e.bonusPrize) collectedBonusLife(world)
  if (e.kind === 'coin') {
    collectCoin(world, p)
    if (e.spriteId === 0x21) showHitAward(world.state, p, e, 200)
    return true
  }
  if (e.kind === 'oneUp') showHitAward(world.state, p, e, '1up')
  else {
    if (e.kind === 'star') p.star = 600
    else if (e.kind === 'mushroom' || e.kind === 'feather' || e.kind === 'flower') {
      storePowerup(p, e.kind)
      if (e.kind === 'mushroom' && p.form === 'small') changePlayerForm(world, p, 'super')
      if (e.kind === 'flower') changePlayerForm(world, p, 'fire')
      if (e.kind === 'feather') changePlayerForm(world, p, 'cape')
      expandPlayer(world, p)
    }
    if (!e.reserveDrop) showHitAward(world.state, p, e, 1000)
  }
  emit(world, 'item', p)
  return true
}
