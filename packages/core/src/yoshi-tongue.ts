import { Buttons } from './types.ts'
import type { World, PlayerState, EntityState, YoshiMouth } from './types.ts'
import { koopaShell, yoshiPowers } from './yoshi-colors.ts'
import { spawnEntity, emit } from './state.ts'
import { collectCoin } from './resources.ts'
import { takeItem } from './item-pickup.ts'
import { swallowBerry } from './yoshi-berries.ts'
import { yoshiTongueTip } from './yoshi-geometry.ts'
import { overlaps } from './terrain.ts'
import { plantContactBox } from './pipe-plant.ts'

export function clearMouth(p: PlayerState) {
  p.mouth = null
  p.tongue = 0
  p.tongueFrame = 0
}
function canTaste(world: World, e: EntityState) {
  // Extended sprites and scripted objects have no SNES standard-sprite tweaker row.
  if (e.kind === 'fireball' || e.kind === 'yoshiFire' || e.kind === 'chuckShot' || e.kind === 'blockSnake')
    return false
  if (e.kind === 'cloudCoin' || e.bonusPrize) return false
  const traits = world.campaign.yoshiTraits
  return !!traits && e.spriteId < traits.length && !(traits[e.spriteId] & 1)
}
export function taste(world: World, p: PlayerState, e: EntityState, input: number) {
  if (!p.mounted || p.tongueFrame < 9 || p.mouth || !canTaste(world, e)) return false
  if (!overlaps(yoshiTongueTip(p, input), e.kind === 'plant' && e.pipePlant ? plantContactBox(e) : e)) return false
  p.mouth = {
    kind: e.shellColor ? 'shell' : e.kind,
    spriteId: koopaShell(e.spriteId) ?? e.spriteId,
    entityId: e.id,
    shellColor: e.shellColor,
    rainbow: e.rainbow,
    caughtFrame: p.tongueFrame,
    ticks: 0,
  }
  if (e.owner && world.state.players[e.owner].carrying === e.id) world.state.players[e.owner].carrying = null
  e.active = false
  return true
}

function swallow(world: World, p: PlayerState, food: YoshiMouth) {
  if (food.berry) swallowBerry(world, p, food.berry)
  else {
    const item = world.state.entities.find(e => e.id === food.entityId)
    if (item) Object.assign(item, {
      roomId: p.roomId, x: p.x + p.width / 2 + p.facing * 10, y: p.y + p.height - 16,
    })
    if (!item || !takeItem(world, item, p)) collectCoin(world, p)
    emit(world, 'swallow', p)
  }
  clearMouth(p)
}
export function releaseMouth(world: World, p: PlayerState, input: number, forceDrop = false) {
  const food = p.mouth
  if (!food || food.kind === 'berry') {
    clearMouth(p)
    return
  }
  const x = p.x + p.facing * 16,
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
    if (spat.kind === 'shell' && (forceDrop || input & Buttons.down)) {
      spat.tossed = true
      spat.vx = forceDrop ? 0 : p.facing
    }
    p.cooldown = 16
  }
  clearMouth(p)
  emit(world, 'spit', p)
}
export function stepTongue(world: World, p: PlayerState, input: number, pressed: number) {
  if (!p.mounted) return
  if (p.berryBite) return
  if (!p.tongueFrame) {
    if (pressed & Buttons.run) {
      if (p.mouth) releaseMouth(world, p, input)
      else {
        p.tongueFrame = 1
        emit(world, 'tongue', p)
      }
    } else if (p.mouth && --p.mouth.ticks <= 0) swallow(world, p, p.mouth)
    return
  }
  const tick = world.state.tick
  if (Math.floor(tick * 5 / 6) === Math.floor((tick - 1) * 5 / 6)) return
  const frame = ++p.tongueFrame
  const caught = p.mouth?.caughtFrame
  if (!caught && frame >= 9 && frame <= 19) p.tongue += 3
  if (frame < (caught ? caught + 10 : 27)) return
  if (p.tongue >= 4) {
    p.tongue -= 4
    return
  }
  if (!p.tongue && !p.mouth) {
    p.tongueFrame = 0
    return
  }
  p.tongue = 0
  if (!p.mouth) return
  if (p.mouth.kind !== 'berry' && (world.campaign.yoshiTraits![p.mouth.spriteId] & 2)) {
    p.mouth.ticks = Math.ceil(0xff * 4 * 6 / 5)
    p.tongueFrame = 0
  } else swallow(world, p, p.mouth)
}
