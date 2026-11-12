import {
  createGame,
  makeSave,
  stepGame,
  type CampaignDefinition,
  type CampaignSave,
  type GameState,
} from '@smw/core';
import type { GameSession } from '../game/playback';

export type LocalGameCallbacks = {
  step: (state: GameState) => void;
  save: (save: CampaignSave) => void;
};

export class LocalGameSession implements GameSession {
  readonly playerId = 'mario' as const;
  readonly state: GameState;
  paused = false;

  constructor(
    private campaign: CampaignDefinition,
    save: CampaignSave | undefined,
    private callbacks: LocalGameCallbacks,
  ) {
    this.state = createGame(campaign, save, 'solo');
  }

  get displayState() {
    return this.state;
  }

  update(buttons: number) {
    if (this.paused) return;
    const previousPhase = this.state.phase;
    stepGame(this.campaign, this.state, { mario: buttons, luigi: 0 });
    this.callbacks.step(this.state);
    if (
      previousPhase !== this.state.phase ||
      this.state.events.some(
        ({ type }) => type === 'checkpoint' || type === 'exit' || type === 'gameOver',
      )
    )
      this.callbacks.save(makeSave(this.state));
  }

  pause(paused: boolean) {
    this.paused = paused;
  }
}
