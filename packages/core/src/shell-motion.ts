import { playerViewport } from './autoscroll.ts'
import { bump } from './blocks.ts'
import { moveBody, limit } from './terrain.ts'
import { activePlayerIds, Buttons, type EntityState, type LevelDefinition, type PlayerState, type World } from './types.ts'

// ShellSpeedX in E1 is ±$37 sixteenths of a pixel per PAL frame on foot.
export const shellKickSpeed = 55 / 16 * (5 / 6)

export function releaseShell(shell: EntityState, player: PlayerState, buttons: number) {
  delete shell.shellChain
  if (buttons & Buttons.up) {
    shell.vx = player.vx / 2
    shell.vy = -7
    shell.tossed = true
  } else if (buttons & Buttons.down) {
    shell.x = player.x + (player.facing === 1 ? player.width : -shell.width)
    shell.vx = player.vx + player.facing * 0.25
    shell.vy = 0
    shell.tossed = true
  } else {
    const forward = Math.max(0, player.vx * player.facing)
    shell.vx = player.facing * (shellKickSpeed + forward / 2)
    shell.vy = 0
  }
}

export function moveShell(world: World, room: LevelDefinition, shell: EntityState, nearest: PlayerState) {
  if (shell.bracedBy) {
    const koopa = world.state.entities.find((actor) => actor.id === shell.bracedBy)
    if (koopa?.active && koopa.kind === 'walker' && koopa.shellDefense?.id === shell.id) return
    delete shell.bracedBy
  }
  if (shell.rainbow && !shell.tossed) {
    const facing = shell.vx + limit(nearest.x - shell.x, -0.12, 0.12)
    shell.vx = (facing < 0 ? -1 : 1) * 2.6
  }
  const incoming = shell.vx
  shell.vy = Math.min(4, shell.vy + 0.23)
  const impacts = moveBody(world, room, shell)
  const player = shell.owner ? world.state.players[shell.owner] : nearest
  if (shell.tossed) {
    for (const hit of impacts) {
      if (hit.side === 'top' && !hit.layer2) bump(world, player, room, hit, false)
    }
    if (shell.grounded) {
      shell.vx = 0
      shell.owner = null
      delete shell.shellChain
      delete shell.tossed
    }
    return
  }
  if (!incoming) return
  const side = incoming < 0 ? 'left' : 'right'
  const wall = impacts.find((hit) => hit.side === side)
  // E1 01:99AA checks SpriteOffscreenX and ignores the horizontal edge bands.
  if (wall && !wall.layer2 && activePlayerIds(world.state).some((id) => {
    const viewer = world.state.players[id]
    if (viewer.status !== 'alive' || viewer.roomId !== room.id) return false
    const screenX = shell.x - playerViewport(room, viewer).x
    return screenX >= 8 && screenX < 236
  })) bump(world, player, room, wall, false)
  if (wall || shell.x <= 0 || shell.x >= room.width * 16 - shell.width) shell.vx = -incoming
}
