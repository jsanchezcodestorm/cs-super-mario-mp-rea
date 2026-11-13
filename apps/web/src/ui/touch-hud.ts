import type { GameState, PlayerId } from '@smw/core';

type Mode = 'idle' | 'map' | 'level' | 'continue';
export const touchDevice = window.matchMedia('(any-pointer: coarse)');

export class TouchHud {
  private readonly action: HTMLButtonElement;

  constructor(private readonly root: HTMLElement) {
    this.action = root.querySelector<HTMLButtonElement>('[data-control="action"]')!;
    this.clear();
  }

  update(state: GameState, id: PlayerId) {
    const player = state.players[id];
    if (state.cutscene) {
      this.show('continue', 'Salta filmato');
    } else if (state.goalWalk || state.orbFinish || state.keyholeFinish) {
      this.clear();
    } else if (state.phase === 'ending' || state.phase === 'gameOver') {
      this.show('continue', 'Torna alla mappa');
    } else if (state.phase === 'map') {
      this.show('map', 'Entra');
    } else if (player.status === 'alive') {
      this.show('level', undefined, !!player.reserve);
    } else {
      this.clear();
    }
  }

  clear() {
    this.show('idle');
  }

  private show(mode: Mode, actionLabel?: string, hasReserve = false) {
    if (this.root.dataset.mode !== mode) this.root.dataset.mode = mode;
    if (this.root.hasAttribute('data-has-reserve') !== hasReserve)
      this.root.toggleAttribute('data-has-reserve', hasReserve);
    if (actionLabel && this.action.getAttribute('aria-label') !== actionLabel) {
      this.action.textContent = actionLabel;
      this.action.setAttribute('aria-label', actionLabel);
    }
  }
}
