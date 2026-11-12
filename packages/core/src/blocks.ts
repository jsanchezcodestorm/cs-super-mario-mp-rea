import { blockReward } from './block-rewards.ts'
import { chocolateRoom } from './chocolate-island.ts'
import { Buttons } from './types.ts'
import type { World, PlayerState, LevelDefinition } from './types.ts'
import { emit, enterRoom, spawnEntity } from './state.ts'
import { collectCoin, die, hurt } from './resources.ts'
import { bodyCells, tileAt, changeTile, isDanger, AIR, USED } from './terrain.ts'
import type { Contact } from './terrain.ts'
import { finishCourse } from './campaign.ts'

export function setCheckpoint(world: World, p: PlayerState, x: number, y: number) {
  const cp = world.state.progress.checkpoint
  if (cp && cp.roomId === p.roomId && cp.x === x && cp.y === y) return
  world.state.progress.checkpoint = { roomId: p.roomId, x, y }
  if (p.form === 'small') {
    p.form = 'super'
    p.y -= 12
    p.height = 28
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
function bump(world: World, p: PlayerState, room: LevelDefinition, c: Contact) {
  const { tile, col, row } = c
  if (tile === 0x112) {
    world.state.onOff = !world.state.onOff
    emit(world, 'switch', p)
    return
  }
  if (tile === 0x11e) {
    changeTile(world, room, col, row, AIR)
    world.state.turning.push({ roomId: room.id, col, row, until: world.state.tick + 155 })
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
  if (tile >= 0x111 && tile <= 0x116) p.vy = 3
  else changeTile(world, room, col, row, USED)
  if (reward === 'coin') collectCoin(world, p)
  else if (reward !== null) {
    const obtained = spawnEntity(world, room.id, {
      x: col * 16,
      y: (row - 1) * 16,
      spriteId: reward === 0x2c && p.mounted ? 0x78 : reward,
    })
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
  for (const c of contacts) {
    if (c.side === 'bottom' && c.tile === USED) {
      for (const e of world.state.entities) if (e.roomId === room.id && e.snake) e.snake.started = true
    }
    if (isDanger(c.tile, room.tileset)) hurt(world, p)
    if (c.layer2) continue
    if (c.side === 'top') bump(world, p, room, c)
    if (c.side === 'bottom' && c.tile >= 0x111 && c.tile <= 0x116) p.vy = input & Buttons.jump ? -7 : -4
    if (c.side === 'bottom' && c.tile === 0x11e && p.spin && p.form !== 'small')
      changeTile(world, room, c.col, c.row, AIR)
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
        if (++p.dragonCoins === 5) p.lives = Math.min(99, p.lives + 1)
      }
      if (tile === 0x6e) p.lives = Math.min(99, p.lives + 3)
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
