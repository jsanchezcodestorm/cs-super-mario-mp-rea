import { carryRopePlayer } from './rope-motor.ts'
import { isNetKoopaTurning, netKoopaBox } from './net-koopa.ts'
import { takeFishingPrize } from './lakitu.ts'
import { palFrame, switchDurationTicks } from './pal-time.ts'
import { beginEntityDefeat } from './entity-defeat.ts'
import { keyholeAnchor } from './keyhole.ts'
import { residentContact } from './level-npcs.ts'
import { beginOrbFinish } from './orb-finish.ts'
import { plantContactBox } from './pipe-plant.ts'
import { playerAnimation } from './player-animation.ts'
import { touchFlyingQuestion } from './flying-question.ts'
import { shellKickSpeed } from './shell-motion.ts'
import { collectCloudCoin } from './coin-game-cloud.ts'
import { isWallSpring, wallBounce } from './wall-spring.ts'
import { withdrawWizard } from './magikoopa.ts'
import { isPipeBoss } from './pipe-boss.ts'
import { hammerRider } from './flying-platforms.ts'
import { landOnMovingDeck } from './platform-rider.ts'
import { deckBounds, type DeckBounds } from './deck-bounds.ts'
import { hitSolidDeck } from './solid-deck.ts'
import { playerContactBody } from './player-size.ts'
import { hazardContactBody, isHazardContactEntity, touchesHazard } from './hazard-contact.ts'
import type { HazardSweep } from './hazard-contact.ts'
import { takeItem } from './item-pickup.ts'
import { goalReward, addScore, showHitAward } from './rewards.ts'
import { taste } from './yoshi-tongue.ts'
import { shellColor, koopaShell } from './yoshi-colors.ts'
import { isTiltingArena } from './arena.ts'
import { Buttons } from './types.ts'
import type { World, PlayerState, EntityState } from './types.ts'
import { overlaps, clipDisplacement } from './terrain.ts'
import { emit, spawnEntity } from './state.ts'
import { hurt } from './resources.ts'
import { finishCourse } from './campaign.ts'
import { settleGoalCoins } from './goal-coins.ts'

export const weaponTargets = new Set([
  'lakitu',
  'chuck',
  'koopa',
  'netKoopa',
  'walker',
  'rex',
  'spiny',
  'jumper',
  'flyer',
  'fish',
  'plant',
  'boss',
  'endingBoss',
])
const edible = new Set(['walker', 'koopa', 'rex', 'spiny', 'jumper', 'fish', 'flyer', 'plant'])
export function strike(world: World, e: EntityState, p: PlayerState) {
  if (e.kind === 'magikoopa') {
    if (e.height) {
      addScore(p, 100)
      withdrawWizard(e)
    }
    return
  }
  if (e.kind === 'boss' && isTiltingArena(e.roomId)) {
    const downhill = Math.sign(Math.sin((world.state.tick * Math.PI) / 230)) || 1
    e.vx = downhill * 2.9
    return
  }
  if (isPipeBoss(e)) {
    if (!e.height || e.kind === 'pipeDecoy' || (e.stunnedUntil ?? 0) > e.age) return
    e.stunnedUntil = e.age + 100
  }
  if (e.kind === 'chuck') {
    if (e.stunnedUntil && e.age < e.stunnedUntil) return
    e.stunnedUntil = e.age + 18
  }
  addScore(p, 100)
  e.hp--
  if (e.kind === 'endingBoss') e.hurtAt = e.age
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
    const horizontal = e.x + e.width / 2 - (p.x + p.width / 2)
    const direction: -1 | 1 = horizontal < 0 ? -1 : horizontal > 0 ? 1 : p.facing
    beginEntityDefeat(world, e, direction)
    if (e.kind === 'endingBoss') finishCourse(world, p, 'normal', { ending: true })
    if (
      e.kind === 'boss' &&
      !world.state.entities.some(
        (other) => other.active && other.kind === 'boss' && other.roomId === e.roomId,
      )
    )
      finishCourse(world, p, world.state.progress.course === '013' ? 'secret' : 'normal')
  }
}
export function contact(world: World, e: EntityState, p: PlayerState, input: number, previousBottom: number,
  previousDeck?: DeckBounds, previousX = p.x, hazardSweep?: HazardSweep) {
  if (!e.active || !e.height || p.status !== 'alive' || e.roomId !== p.roomId) return
  // Ordinary level sprites occupy the front plane. The PAL standard contact
  // handler compares their scenery-side bit with the player's before clipping.
  if (e.kind !== 'exitSide' && !!p.behindNet !== !!e.netKoopa?.behind) return
  if (e.netKoopa && isNetKoopaTurning(e.netKoopa)) return
  if (e.kind === 'ropeMotor') { carryRopePlayer(world, e, p, input); return }
  if (e.kind === 'lakitu') takeFishingPrize(world, e, p)
  if (e.booStream?.trail.some(part => part.until > palFrame(world.state.tick) &&
    overlaps(playerContactBody(p), { x: part.x+4, y: part.y+4, width: 8, height: 8 }))) hurt(world,p)
  if (e.kind === 'coinGameCloud') return
  if ((e.kind === 'levelNpc' || e.spriteId === 0xaf) && residentContact(world, e, p, previousBottom)) return
  if (e.kind === 'cloudCoin') {
    collectCloudCoin(world, e, p)
    return
  }
  if (isPipeBoss(e) && (!e.height || (e.stunnedUntil ?? 0) > e.age)) return
  if (e.kind === 'exitSide') {
    const end = world.campaign.levels[e.roomId].width * 16 - p.width - 1
    if (p.x >= end || (p.x <= 0 && input & Buttons.left)) finishCourse(world, p, 'normal', { countsAsExit: false })
    return
  }
  if (e.owner && world.state.players[e.owner].carrying === e.id) return
  if (e.kind === 'flyingQuestion') {
    touchFlyingQuestion(world, e, p, previousBottom)
    return
  }
  if (e.kind === 'vine' || e.kind === 'blockSnake' || e.kind === 'directionalCoins') return
  if (e.kind === 'goal') {
    if (p.x + p.width >= e.x - 8 && p.x < e.x + 8 && p.y <= e.origin.y + 16) {
      const scoreBefore = p.score, starsBefore = p.bonusStars
      goalReward(world, p, e)
      const stars = p.bonusStars - starsBefore
      const coins = settleGoalCoins(world, p, e, stars > 0)
      e.active = false
      finishCourse(world, p, e.secret ? 'secret' : 'normal', { tape: { scoreBefore, stars, coins } })
    }
    return
  }
  if (e.kind === 'plant' && e.pipePlant?.hidden) return
  if (e.kind === 'platform') {
    const foot = { x: previousX, bottom: previousBottom }
    const old = previousDeck ?? deckBounds(e)
    if (landOnMovingDeck(world, e, p, foot, old)) return
    if (hitSolidDeck(world, e, p, foot, old) === 'head' && e.spriteId === 0x9c) {
      const rider = hammerRider(world, e)
      if (rider) strike(world, rider, p)
    }
    return
  }
  if (taste(world, p, e, input)) return
  if (e.kind === 'yoshiEgg') return
  // E1 $B3 uses clipping profile $2D. Only the tip of the two-tile fireball burns.
  if (e.spriteId === 0xb3 && e.kind === 'bullet') {
    if (touchesHazard(e, p, hazardSweep)) hurt(world, p)
    return
  }
  if (e.fromEnemyBlock && e.spriteId === 0x15 && !world.campaign.levels[e.roomId].water && overlaps(p, e)) {
    e.active = false
    e.shellKnockedOut = true
    e.vx = p.x < e.x ? 1 : -1
    e.vy = -2
    addScore(p, 100)
    return
  }
  const surface = e.kind === 'spring'
  const hazard = isHazardContactEntity(e)
  const body = hazard ? hazardContactBody(e) :
    e.kind === 'netKoopa' ? netKoopaBox(e) : e.kind === 'plant' && e.pipePlant ? plantContactBox(e) : e
  if (!body || (hazard ? !touchesHazard(e, p, hazardSweep) : !overlaps(surface ? p : playerContactBody(p), body))) return
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
  if (e.kind === 'chuckShot' || e.kind === 'magic') {
    hurt(world, p)
    return
  }
  if (e.pickupDelay || takeItem(world, e, p)) return
  if (e.kind === 'orb') {
    e.active = false
    beginOrbFinish(world, p)
    finishCourse(world, p)
    return
  }
  if (e.kind === 'cloud') {
    if (p.vy >= 0 && !e.owner && !p.cooldown && p.cloud === undefined) {
      e.owner = p.id
      p.cloud = e.id
      p.flight = 0
      p.y = e.y - p.height + 2
      p.vy = 0
    }
    return
  }
  if (e.kind === 'keyhole') {
    const held = world.state.entities.find((item) => item.id === p.carrying)
    if (held?.kind === 'key' || (p.mounted && p.mouth?.kind === 'key' && p.mouth.ticks > 0)) {
      finishCourse(world, p, 'secret')
      const { state } = world
      const exit = state.events.find(event => event.type === 'exit' && event.playerId === p.id)
      if (exit) exit.keyhole = true
      if (state.phase === 'map' && !state.cutscene)
        state.keyholeFinish = { tick: state.tick, finisher: p.id, ...keyholeAnchor(e) }
    }
    return
  }
  const landed = previousBottom <= body.y + 6 && p.vy >= 0
  if (e.kind === 'spring') {
    if (e.spriteId === 0x2f && !landed && !p.mounted && !p.carrying && input & Buttons.run) {
      e.owner = p.id
      p.carrying = e.id
      return
    }
    if (landed) {
      p.y = e.y - p.height
      p.vy = isWallSpring(e.spriteId) ? wallBounce(e, p, input) : input & Buttons.jump ? -9 : -6
      p.grounded = p.vy >= 0
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
      const duration = switchDurationTicks(world.state.tick)
      if (Math.floor(e.origin.x / 16) % 2 === 0) world.state.pSwitch = duration
      else {
        world.state.silverSwitch = duration
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
  if (e.kind === 'shell' && e.owner === p.id && p.cooldown > 0) return
  if (
    e.kind === 'babyYoshi' ||
    e.kind === 'key' ||
    e.kind === 'throwBlock' ||
    e.kind === 'mechaShell' ||
    (e.kind === 'shell' && (e.tossed || e.vx === 0))
  ) {
    if (!p.mounted && p.carrying === null && input & Buttons.run) {
      p.carrying = e.id
      e.owner = p.id
      playerAnimation(p).pickup = 8
      if (e.kind === 'shell') {
        delete e.tossed
        e.vx = 0
        e.vy = 0
        delete e.shellChain
        delete e.bracedBy
      }
    } else if (e.kind === 'shell' && !p.cooldown) {
      showHitAward(world.state, p, e, 200)
      const direction = p.x + p.width / 2 <= e.x + e.width / 2 ? 1 : -1
      e.vx = direction * shellKickSpeed
      delete e.tossed
      delete e.bracedBy
      delete e.shellChain
      p.cooldown = 12
      playerAnimation(p).kick = 12
      e.owner = p.id
    }
    return
  }
  if (e.kind === 'fireball' || e.kind === 'yoshiFire') return
  if (p.sliding && weaponTargets.has(e.kind) && e.kind !== 'boss' && e.kind !== 'endingBoss' &&
      world.campaign.slideTargets?.includes(e.spriteId)) {
    beginEntityDefeat(world, e, p.facing)
    addScore(p, 100)
    emit(world, 'stomp', p)
    return
  }
  if (p.star > 0 && e.kind !== 'boss' && e.kind !== 'endingBoss') {
    if (e.kind === 'magikoopa') strike(world, e, p)
    else beginEntityDefeat(world, e, p.facing)
    return
  }
  if (
    landed &&
    ((e.kind !== 'spiny' && e.kind !== 'hazard' && e.kind !== 'plant' && e.kind !== 'boo') ||
      p.spin ||
      p.mounted)
  ) {
    p.vy = input & Buttons.jump ? -4.8 : -3.1
    const top = e.y - p.height
    p.y = clipDisplacement(world, world.campaign.levels[p.roomId], p, 'y', top - p.y)
    // E1 InitSuperKoopaFthr marks the even-column running Koopa with a
    // flashing cape. A normal stomp ejects that feather (02:EAF2).
    if (e.spriteId === 0x73 && !(e.origin.x & 16) && !p.spin && !p.mounted) {
      const feather = spawnEntity(world, e.roomId, { x: e.x, y: e.y, spriteId: 0x77 })!
      feather.pickupDelay = 48
      feather.vy = -3
      e.spriteId = 2
      e.kind = 'walker'
      addScore(p, 100)
    } else if (e.kind === 'shell') {
      delete e.shellChain
      delete e.tossed
      delete e.bracedBy
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
