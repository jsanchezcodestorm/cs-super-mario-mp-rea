import {
  createGame,
  createGameAtCourse,
  makeSave,
  stepGame,
  type CampaignDefinition,
  type CampaignSave,
  type GameState,
} from '@smw/core';
import type { GameSession } from '../game/playback';

export type LocalGameCallbacks = {
  step: (state: GameState) => void;
  save?: (save: CampaignSave) => void;
};

export type LocalGameOptions = {
  startAtCourse?: string;
};

export class LocalGameSession implements GameSession {
  readonly playerId = 'mario' as const;
  readonly state: GameState;
  paused = false;

  constructor(
    private campaign: CampaignDefinition,
    save: CampaignSave | undefined,
    private callbacks: LocalGameCallbacks,
    options: LocalGameOptions = {},
  ) {
    this.state = options.startAtCourse !== undefined
      ? createGameAtCourse(campaign, options.startAtCourse, 'solo')
      : createGame(campaign, save, 'solo');
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
      this.callbacks.save?.(makeSave(this.state));
  }

  pause(paused: boolean) {
    this.paused = paused;
  }
}
