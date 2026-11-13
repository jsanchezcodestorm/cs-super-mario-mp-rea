import { hitBonusQuestion } from './question-bonus.ts'
import { giveBlockCoin, startBlockBounce } from './block-bounce.ts'
import { startTurnBlock } from './turn-block.ts'
import { blockReward } from './block-rewards.ts'
import { chocolateRoom } from './chocolate-island.ts'
import { Buttons } from './types.ts'
import type { World, PlayerState, LevelDefinition } from './types.ts'
import { emit, enterRoom, spawnBlockReward, spawnEntity } from './state.ts'
import { collectCoin, die, hurt } from './resources.ts'
import { bodyCells, tileAt, changeTile, isDanger, AIR, USED } from './terrain.ts'
import type { Contact } from './terrain.ts'
import { finishCourse } from './campaign.ts'
import { expandPlayer } from './player-size.ts'
import { awardLives } from './lives.ts'

export function setCheckpoint(world: World, p: PlayerState, x: number, y: number) {
  const cp = world.state.progress.checkpoint
  if (cp && cp.roomId === p.roomId && cp.x === x && cp.y === y) return
  world.state.progress.checkpoint = { roomId: p.roomId, x, y }
  if (p.form === 'small') {
    p.form = 'super'
    expandPlayer(world, p)
  }
  emit(world, 'checkpoint', p)
}
function exitThrough(world: World, p: PlayerState, room: LevelDefinition) {
  if (p.cooldown > 0) return
  const screen = Math.floor((room.vertical ? p.y + p.height / 2 : p.x + p.width / 2) / 256)
  const exit = room.exits.find((e) => e.screen === screen)
  if (!exit) return
  const target =
    world.state.progress.course === '024'
      ? chocolateRoom(exit.target, world.state.courseCoins, p.dragonCoins, world.state.timeLeft)
      : exit.target
  if (!Object.hasOwn(world.campaign.levels, target)) return
  const held = world.state.entities.find((e) => e.id === p.carrying)
  enterRoom(world, p, target, exit.spawn)
  if (held) {
    held.roomId = target
    held.x = p.x
    held.y = p.y
  }
  emit(world, 'pipe', p)
}
export function bump(world: World, p: PlayerState, room: LevelDefinition, c: Pick<Contact, 'col' | 'row' | 'tile'>, headBump = true) {
  const { tile, col, row } = c
  if (tileAt(world, room, col, row) !== tile) return
  if (tile === 0x124 && room.tileset === 4) {
    hitBonusQuestion(world, p, room, col, row)
    emit(world, 'block', p)
    return
  }
  if (tile === 0x112) {
    world.state.onOff = !world.state.onOff
    emit(world, 'switch', p)
    return
  }
  if (tile === 0x11e) {
    startTurnBlock(world, room, col, row)
    emit(world, 'block', p)
    return
  }
  if (!(
    (tile >= 0x111 && tile <= 0x12d) ||
    (tile >= 0x21 && tile <= 0x24) ||
    tile === 0x16a ||
    tile === 0x16b
  ))
    return
  const reward = blockReward(tile, col, p, world.state.courseCoins)
  if (tile >= 0x111 && tile <= 0x116 && tile !== 0x114) {
    if (headBump) p.vy = 3
  }
  else if ((tile >= 0x11f && tile <= 0x128) || tile === 0x11b || (tile >= 0x21 && tile <= 0x22)) {
    startBlockBounce(world, room, col, row, tile)
  } else changeTile(world, room, col, row, USED)
  if (reward === 'coin') giveBlockCoin(world, p, room, col, row)
  else if (reward !== null) {
    const obtained = spawnBlockReward(world, room.id, {
      x: col * 16,
      y: (reward === 0x45 ? row : row - 1) * 16,
      spriteId: reward === 0x2c && p.mounted ? 0x78 : reward,
    })
    if (obtained?.kind === 'directionalCoins') obtained.owner = p.id
    if (obtained?.kind === 'yoshiEgg') {
      obtained.adultEgg = true
      obtained.yoshiColor = 'green'
    }
  }
  emit(world, 'block', p)
}
export function interactTiles(
  world: World,
  p: PlayerState,
  room: LevelDefinition,
  input: number,
  pressed: number,
  contacts: Contact[],
) {
  const headCol = Math.floor((p.x + p.width / 2) / 16)
  const questionAtCenter = contacts.some(c => c.side === 'top' && !c.layer2 && c.col === headCol &&
      c.tile >= 0x11f && c.tile <= 0x128)
  for (const c of contacts) {
    if (c.side === 'bottom' && c.tile === USED) {
      for (const e of world.state.entities) if (e.roomId === room.id && e.snake) e.snake.started = true
    }
    if (isDanger(c.tile, room.tileset)) hurt(world, p)
    if (c.layer2) continue
    // A single PAL head probe chooses one block when two ? blocks share an edge.
    if (c.side === 'top' && (!questionAtCenter || c.col === headCol || c.tile < 0x11f || c.tile > 0x128))
      bump(world, p, room, c)
    if (c.side === 'bottom' && c.tile >= 0x111 && c.tile <= 0x116 && c.tile !== 0x114) p.vy = input & Buttons.jump ? -7 : -4
    if (c.side === 'bottom' && c.tile >= 0xec && c.tile <= 0xfb && (c.tile - 0xec) % 4 < 2)
      finishCourse(world, p)
    if (c.tile === 0x12e && pressed & Buttons.run && !p.mounted && !p.carrying) {
      const block = spawnEntity(world, room.id, { x: c.col * 16, y: c.row * 16, spriteId: 0x53 })
      if (block) {
        changeTile(world, room, c.col, c.row, AIR)
        block.owner = p.id
        p.carrying = block.id
      }
    }
    const direction = { bottom: Buttons.down, top: Buttons.up, right: Buttons.right, left: Buttons.left }[
      c.side
    ]
    const vertical = (c.side === 'bottom' || c.side === 'top') && (c.tile === 0x137 || c.tile === 0x138)
    const horizontal = (c.side === 'left' || c.side === 'right') && c.tile === 0x13f && p.grounded
    if ((horizontal || vertical) && input & direction) exitThrough(world, p, room)
    if (p.roomId !== room.id || p.status !== 'alive') return
  }
  for (const { col, row } of bodyCells(p)) {
    const tile = tileAt(world, room, col, row)
    if (tile === 5 || tile >= 0x1fb) {
      die(world, p)
      return
    }
    if (tile === 0x38) {
      changeTile(world, room, col, row, AIR)
      setCheckpoint(world, p, col * 16, row * 16)
      continue
    }
    if ((tile >= 0x2b && tile <= 0x2e) || tile === 0x6e) {
      changeTile(world, room, col, row, AIR)
      if (tile === 0x2d || tile === 0x2e) {
        changeTile(world, room, col, row + (tile === 0x2d ? 1 : -1), AIR)
        if (++p.dragonCoins === 5) awardLives(world.state, p, 1)
      }
      if (tile === 0x6e) awardLives(world.state, p, 3)
      else collectCoin(world, p)
    }
    if (
      pressed & Buttons.up &&
      (tile === 0x20 ||
        (tile === 0x1f && p.form === 'small') ||
        (tile === 0x9c && room.tileset === 1) ||
        (world.state.pSwitch > 0 && (tile === 0x27 || tile === 0x28)))
    )
      exitThrough(world, p, room)
    if (p.roomId !== room.id) return
  }
  const cp = room.checkpoint
  if (cp && Math.abs(p.x - cp.x) < 12 && Math.abs(p.y - cp.y) < 20) setCheckpoint(world, p, cp.x, cp.y)
}
