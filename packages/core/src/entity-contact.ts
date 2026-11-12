import { collectedBonusLife } from './bonus-game.ts'
import { goalReward, addScore, storePowerup } from './rewards.ts'
import { taste } from './yoshi-tongue.ts'
import { shellColor, koopaShell } from './yoshi-colors.ts'
import { isTiltingArena } from './arena.ts'
import { Buttons } from './types.ts'
import type { World, PlayerState, EntityState } from './types.ts'
import { overlaps } from './terrain.ts'
import { emit } from './state.ts'
import { collectCoin, hurt } from './resources.ts'
import { finishCourse } from './campaign.ts'

const edible = new Set(['walker', 'koopa', 'rex', 'spiny', 'jumper', 'fish', 'flyer', 'plant'])
const pickups = new Set(['mushroom', 'flower', 'star', 'feather', 'oneUp', 'coin'])
function pickup(world: World, e: EntityState, p: PlayerState) {
  e.active = false
  if (e.bonusPrize) collectedBonusLife(world)
  if (e.kind === 'coin') {
    collectCoin(world, p)
    return
  }
  if (e.kind === 'oneUp') p.lives = Math.min(99, p.lives + 1)
  else if (e.kind === 'star') p.star = 600
  else {
    if (e.kind === 'mushroom' || e.kind === 'feather' || e.kind === 'flower') storePowerup(p, e.kind)
    if (e.kind === 'mushroom' && p.form === 'small') p.form = 'super'
    if (e.kind === 'flower') p.form = 'fire'
    if (e.kind === 'feather') p.form = 'cape'
    p.y -= 28 - p.height
    p.height = 28
  }
  if (e.kind !== 'oneUp' && !e.reserveDrop) addScore(p, 1000)
  emit(world, 'item', p)
}
export function strike(world: World, e: EntityState, p: PlayerState) {
  if (e.kind === 'boss' && isTiltingArena(e.roomId)) {
    const downhill = Math.sign(Math.sin((world.state.tick * Math.PI) / 230)) || 1
    e.vx = downhill * 2.9
    return
  }
  if (e.kind === 'chuck') {
    if (e.stunnedUntil && e.age < e.stunnedUntil) return
    e.stunnedUntil = e.age + 18
  }
  addScore(p, 100)
  e.hp--
  if (e.hp > 0) {
    if (e.kind === 'rex') {
      e.y += e.height - 16
      e.height = 16
    }
    return
  }
  if (e.spriteId >= 8 && e.spriteId <= 12) {
    e.spriteId = koopaShell(e.spriteId)
    e.shellColor = shellColor(e.spriteId)
    e.kind = 'koopa'
    e.hp = 1
    return
  }
  if (e.kind === 'mechakoopa') {
    e.kind = 'mechaShell'
    e.hp = 1
    e.vx = 0
    e.owner = null
  } else if (e.kind === 'koopa') {
    e.kind = 'shell'
    e.hp = 1
    e.vx = 0
    e.owner = null
  } else {
    e.active = false
    if (e.kind === 'endingBoss') finishCourse(world, p, 'normal', true)
    if (
      e.kind === 'boss' &&
      !world.state.entities.some(
        (other) => other.active && other.kind === 'boss' && other.roomId === e.roomId,
      )
    )
      finishCourse(world, p, world.state.progress.course === '013' ? 'secret' : 'normal')
  }
}
export function contact(world: World, e: EntityState, p: PlayerState, input: number, previousBottom: number) {
  if (!e.active || p.status !== 'alive' || e.roomId !== p.roomId) return
  if (e.kind === 'exitSide') {
    const end = world.campaign.levels[e.roomId].width * 16 - p.width - 1
    if (p.x >= end || (p.x <= 0 && input & Buttons.left)) finishCourse(world, p, 'normal', false, false)
    return
  }
  if (e.owner && world.state.players[e.owner].carrying === e.id) return
  if (e.kind === 'vine' || e.kind === 'blockSnake') return
  if (e.spriteId === 0x64) {
    if (
      !p.carrying &&
      !p.mounted &&
      input & Buttons.up &&
      Math.abs(p.x - e.x) < 16 &&
      p.y + p.height > e.y &&
      p.y < e.y + 64
    ) {
      e.owner = p.id
      p.x = e.x
      p.vy = Math.min(0, p.vy)
      p.grounded = true
      if (input & ~p.lastInput & Buttons.jump) p.vy = -5
    }
    return
  }
  if (e.kind === 'goal') {
    if (p.x + p.width >= e.x - 8 && p.x < e.x + 8 && p.y <= e.origin.y + 16) {
      goalReward(world, p, e)
      finishCourse(world, p, e.secret ? 'secret' : 'normal')
    }
    return
  }
  if (taste(world, p, e)) return
  if (e.kind === 'yoshiEgg') return
  if (!overlaps(p, e)) return
  if (e.kind === 'balloon') {
    e.active = false
    p.balloon = 600
    emit(world, 'item', p)
    return
  }
  if (e.spriteId === 0xa9 && p.vy < 0 && p.y > e.y + e.height - 9) {
    p.vy = 1
    strike(world, e, p)
    emit(world, 'stomp', p)
    return
  }
  if (e.kind === 'chuckShot') {
    hurt(world, p)
    return
  }
  if (pickups.has(e.kind)) {
    pickup(world, e, p)
    return
  }
  if (e.kind === 'orb') {
    finishCourse(world, p)
    return
  }
  if (e.kind === 'keyhole') {
    const held = world.state.entities.find((item) => item.id === p.carrying)
    if (held?.kind === 'key' || (p.mounted && p.mouth?.kind === 'key' && p.mouth.ticks > 0))
      finishCourse(world, p, 'secret')
    return
  }
  const landed = previousBottom <= e.y + 6 && p.vy >= 0
  if (e.kind === 'platform' || e.kind === 'spring') {
    if (landed) {
      p.y = e.y - p.height
      p.grounded = true
      p.vy = e.kind === 'spring' ? (input & Buttons.jump ? -9 : -6) : 0
      if (e.kind === 'platform') e.owner = p.id
    }
    return
  }
  if (e.kind === 'yoshi') {
    if (!p.cooldown && !p.mounted) {
      p.mounted = true
      p.yoshiColor = e.yoshiColor!
      e.active = false
      emit(world, 'item', p)
    }
    return
  }
  if (e.kind === 'switch') {
    if (landed) {
      e.active = false
      if (Math.floor(e.origin.x / 16) % 2 === 0) world.state.pSwitch = 600
      else {
        world.state.silverSwitch = 600
        for (const enemy of world.state.entities)
          if (enemy.roomId === e.roomId && edible.has(enemy.kind)) enemy.kind = 'coin'
      }
      emit(world, 'switch', p)
    } else if (!p.carrying && input & Buttons.run) {
      e.owner = p.id
      p.carrying = e.id
    }
    return
  }
  if (
    e.kind === 'babyYoshi' ||
    e.kind === 'key' ||
    e.kind === 'throwBlock' ||
    e.kind === 'mechaShell' ||
    (e.kind === 'shell' && e.vx === 0)
  ) {
    if (!p.mounted && p.carrying === null && input & Buttons.run) {
      p.carrying = e.id
      e.owner = p.id
    } else if (e.kind === 'shell' && !e.owner && !p.cooldown) {
      e.vx = p.facing * 3.5
      p.cooldown = 12
      e.owner = p.id
    }
    return
  }
  if (
    e.kind === 'fireball' ||
    e.kind === 'yoshiFire' ||
    (e.kind === 'shell' && e.owner === p.id && p.cooldown > 0)
  )
    return
  if (p.star > 0 && e.kind !== 'boss' && e.kind !== 'endingBoss') {
    e.active = false
    return
  }
  if (
    landed &&
    ((e.kind !== 'spiny' && e.kind !== 'hazard' && e.kind !== 'plant' && e.kind !== 'boo') ||
      p.spin ||
      p.mounted)
  ) {
    p.vy = input & Buttons.jump ? -4.8 : -3.1
    p.y = e.y - p.height
    if (e.kind === 'shell') {
      e.vx = 0
      e.owner = null
    } else if (
      e.kind !== 'hazard' &&
      e.kind !== 'boo' &&
      e.kind !== 'endingBoss' &&
      e.spriteId !== 0xc5 &&
      e.spriteId !== 0xa9
    )
      strike(world, e, p)
    emit(world, 'stomp', p)
    return
  }
  hurt(world, p)
}
