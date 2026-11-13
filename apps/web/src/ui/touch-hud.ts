import type { GameState, PlayerId } from '@smw/core';

type Mode = 'idle' | 'map' | 'map-prompt' | 'map-requested' | 'level' | 'continue';
export const touchDevice = window.matchMedia('(any-pointer: coarse)');

export class TouchHud {
  private readonly action: HTMLButtonElement;
  private readonly run: HTMLButtonElement;

  constructor(private readonly root: HTMLElement) {
    this.action = root.querySelector<HTMLButtonElement>('[data-control="action"]')!;
    this.run = root.querySelector<HTMLButtonElement>('[data-control="run"]')!;
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
      const request = state.mapRequest;
      if (request) this.show(request.requester === id ? 'map-requested' : 'map-prompt',
        request.requester === id ? 'Annulla' : 'Conferma');
      else this.show('map', state.mode === 'solo' ? 'Avvia' : 'Chiedi');
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
    if (this.root.dataset.mode !== mode) {
      this.root.dataset.mode = mode;
      const refusing = mode === 'map-prompt';
      this.run.dataset.intent = refusing ? 'refuse' : 'run';
      this.run.setAttribute('aria-label', refusing ? 'Rifiuta richiesta di livello' : 'Corsa, fuoco o lingua');
      this.run.querySelector('span')!.textContent = refusing ? '×' : '»';
      const label = Array.from(this.run.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (label) label.textContent = refusing ? 'Rifiuta' : 'Corsa';
    }
    if (this.root.hasAttribute('data-has-reserve') !== hasReserve)
      this.root.toggleAttribute('data-has-reserve', hasReserve);
    if (actionLabel && this.action.getAttribute('aria-label') !== actionLabel) {
      this.action.textContent = actionLabel;
      this.action.setAttribute('aria-label', actionLabel);
    }
  }
}
