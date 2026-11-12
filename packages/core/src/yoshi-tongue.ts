import { Buttons } from './types.ts'
import type { World, PlayerState, EntityState, YoshiMouth } from './types.ts'
import { koopaShell, yoshiPowers } from './yoshi-colors.ts'
import { spawnEntity, emit } from './state.ts'
import { collectCoin } from './resources.ts'
import { overlaps } from './terrain.ts'

export function clearMouth(p: PlayerState) {
  p.mouth = null
  p.tongue = 0
  p.tongueFrame = 0
}
function canTaste(world: World, e: EntityState) {
  // Extended sprites and scripted objects have no SNES standard-sprite tweaker row.
  if (e.kind === 'fireball' || e.kind === 'yoshiFire' || e.kind === 'chuckShot' || e.kind === 'blockSnake')
    return false
  const traits = world.campaign.yoshiTraits
  return !!traits && e.spriteId < traits.length && !(traits[e.spriteId] & 1)
}
export function taste(world: World, p: PlayerState, e: EntityState) {
  if (!p.mounted || p.tongue <= 0 || p.mouth || !canTaste(world, e)) return false
  const x = p.facing === 1 ? p.x + p.width + p.tongue - 8 : p.x - p.tongue
  if (!overlaps({ x, y: p.y + p.height - 15, width: 8, height: 8 }, e)) return false
  p.mouth = {
    kind: e.shellColor ? 'shell' : e.kind,
    spriteId: koopaShell(e.spriteId) ?? e.spriteId,
    shellColor: e.shellColor,
    rainbow: e.rainbow,
    ticks: 0,
  }
  e.active = false
  p.tongueFrame = Math.max(19, p.tongueFrame)
  return true
}
function swallow(world: World, p: PlayerState, food: YoshiMouth) {
  switch (food.kind) {
    case 'mushroom':
    case 'flower':
    case 'feather':
      if (food.kind === 'mushroom' && p.form === 'small') p.form = 'super'
      if (food.kind === 'flower') p.form = 'fire'
      if (food.kind === 'feather') p.form = 'cape'
      p.y -= 28 - p.height
      p.height = 28
      break
    case 'star':
      p.star = 600
      break
    case 'oneUp':
      p.lives = Math.min(99, p.lives + 1)
      break
    default:
      collectCoin(world, p)
  }
  clearMouth(p)
  emit(world, 'swallow', p)
}
export function releaseMouth(world: World, p: PlayerState, input: number, forceDrop = false) {
  if (!p.mouth) return
  const food = p.mouth,
    x = p.x + p.facing * 16,
    y = p.y + p.height - 16
  if (!forceDrop && yoshiPowers(p).fire) {
    for (const [vx, vy] of [
      [2.5, 0],
      [2.25, -0.5],
      [2.25, 0.5],
    ]) {
      const shot = spawnEntity(world, p.roomId, { x, y, spriteId: 0x33 }, 'yoshiFire')!
      Object.assign(shot, { vx: p.facing * vx, vy, owner: p.id, width: 8, height: 8 })
    }
  } else {
    const spat = spawnEntity(world, p.roomId, { x, y, spriteId: food.spriteId }, food.kind)!
    Object.assign(spat, {
      vx: forceDrop ? 0 : p.facing * (input & Buttons.down ? 1 : 3),
      vy: 0,
      owner: p.id,
      shellColor: food.shellColor,
      rainbow: food.rainbow,
    })
    p.cooldown = 16
  }
  clearMouth(p)
  emit(world, 'spit', p)
}
export function stepTongue(world: World, p: PlayerState, input: number, pressed: number) {
  if (!p.mounted) return
  if (p.tongueFrame === 0 && pressed & Buttons.run) {
    if (p.mouth) {
      releaseMouth(world, p, input)
      return
    }
    p.tongueFrame = 1
    emit(world, 'tongue', p)
  }
  if (p.tongueFrame) {
    const frame = p.tongueFrame++
    if (frame >= 7 && frame < 18) p.tongue = Math.min(33, p.tongue + 3)
    if (frame >= 27) p.tongue = Math.max(0, p.tongue - 4)
    if (frame >= 27 && p.tongue === 0) {
      p.tongueFrame = 0
      if (p.mouth) {
        if (world.campaign.yoshiTraits![p.mouth.spriteId] & 2) p.mouth.ticks = 0xff * 4
        else swallow(world, p, p.mouth)
      }
    }
  } else if (p.mouth && --p.mouth.ticks <= 0) swallow(world, p, p.mouth)
}
