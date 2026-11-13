import { showHitAward } from './rewards.ts'
import type { EntityState, GameState, HitAward } from './types.ts'

const chainAwards = [200, 400, 800, 1000, 2000, 4000, 8000, '1up'] as const

function award(state: GameState, shell: EntityState, target: EntityState, amount: HitAward, chain?: number) {
  if (shell.owner) showHitAward(state, state.players[shell.owner], target, amount)
  state.events.push({
    type: 'shellHit', tick: state.tick, roomId: target.roomId, playerId: shell.owner ?? undefined,
    award: shell.owner ? amount : undefined, chain,
  })
}

export function awardShellHit(state: GameState, shell: EntityState, target: EntityState) {
  shell.shellChain = (shell.shellChain ?? 0) + 1
  award(state, shell, target, chainAwards[Math.min(shell.shellChain, chainAwards.length) - 1], shell.shellChain)
}

export function awardShellClash(state: GameState, shell: EntityState, target: EntityState) {
  award(state, shell, target, 1000)
}
