import { changePlayerForm } from './player-size.ts'
import { releaseReserve } from './rewards.ts'
import { clearMouth, releaseMouth } from './yoshi-tongue.ts'
import type { World, PlayerState } from './types.ts'
import { activePlayerIds } from './types.ts'
import { emit, enterRoom, spawnEntity } from './state.ts'
export function die(world: World, p: PlayerState) {
  if (p.status !== 'alive') return
  p.lives = Math.max(0, p.lives - 1)
  p.status = p.lives === 0 ? 'spectator' : 'dead'
  delete p.netTurn
  delete p.netClinging
  delete p.netPunchTick
  delete p.behindNet
  p.timer = world.state.mode === 'solo' ? 228 : 76
  p.death = { y: p.y + p.height - 16, tick: world.state.tick, duration: p.timer }
  p.reserve = null
  delete p.formChange
  p.form = 'small'
  p.height = 16
  p.growthPending = false
  delete p.ducking
  p.mounted = false
  clearMouth(p)
  p.carrying = null
  p.star = 0
  p.vy = -5
  emit(world, 'death', p)
  if (activePlayerIds(world.state).every((id) => world.state.players[id].status === 'spectator')) {
    world.state.phase = 'gameOver'
    emit(world, 'gameOver')
  }
}
export function hurt(world: World, p: PlayerState) {
  if (p.invincible || p.star || p.status !== 'alive') return
  if (p.mounted) {
    releaseMouth(world, p, 0, true)
    p.mounted = false
    const yoshi = spawnEntity(world, p.roomId, { x: p.x + 18 * p.facing, y: p.y, spriteId: 0x35 })
    if (yoshi) {
      yoshi.vx = p.facing * 1.5
      yoshi.yoshiColor = p.yoshiColor
    }
  } else if (p.form !== 'small') {
    releaseReserve(world, p)
    p.y += p.height - 16
    p.height = 16
    changePlayerForm(world, p, 'small')
    p.growthPending = false
  } else {
    die(world, p)
    return
  }
  p.invincible = 90
  emit(world, 'hurt', p)
}
export function tickDead(world: World, p: PlayerState) {
  if (p.status !== 'dead') return
  p.timer--
  p.y += p.vy
  p.vy = Math.min(5, p.vy + 0.2)
  if (p.timer > 0) return
  const checkpoint = world.state.progress.checkpoint
  enterRoom(world, p, checkpoint?.roomId ?? world.state.progress.course, checkpoint ?? undefined)
  p.status = 'alive'
  p.invincible = 90
}
export function collectCoin(world: World, p: PlayerState) {
  world.state.courseCoins++
  if (++p.coins >= 100) {
    p.coins = 0
    p.lives = Math.min(99, p.lives + 1)
  }
  emit(world, 'coin', p)
}
