import { copyState, goalWalkFrame, keyholeFrame, orbFinishFrame, stepGame, type CampaignDefinition, type GameState, type PlayerId } from '@smw/core';

export interface GameSession {
  readonly playerId: PlayerId;
  readonly state?: GameState;
  readonly displayState?: GameState;
  update(buttons: number): void;
  pause(paused: boolean): void;
  receive?(state: GameState, ack: number): void;
}

export class Playback implements GameSession {
  state?: GameState;
  private predicted?: GameState;
  paused = false;
  private seq = 0;
  private pending: { seq: number; buttons: number }[] = [];
  constructor(
    public readonly campaign: CampaignDefinition,
    public readonly playerId: PlayerId,
    private transmit: (seq: number, buttons: number) => boolean,
  ) {}

  // Draw riders, decks and moving terrain at the same simulation tick.
  // Phase changes are confirmed by the server before switching scenes.
  get displayState() {
    return ['playing', 'map'].includes(this.predicted?.phase ?? '') &&
      this.state?.phase === this.predicted?.phase
      ? this.predicted
      : this.state;
  }

  receive(state: GameState, ack: number) {
    this.state = state;
    this.seq = Math.max(ack, this.seq);
    this.pending = this.pending.filter((frame) => frame.seq > ack);
    this.predicted = copyState(state);
    for (const frame of this.pending) this.predict(frame.buttons);
  }

  update(buttons: number) {
    if (!this.state || this.paused || this.pending.length >= 75) return;
    const seq = ++this.seq;
    if (!this.transmit(seq, buttons)) return;
    this.pending.push({ seq, buttons });
    this.predict(buttons);
  }

  pause(paused: boolean) {
    this.paused = paused;
    this.pending = [];
    if (this.state) this.predicted = copyState(this.state);
  }

  private predict(buttons: number) {
    const state = this.predicted;
    if (!state || !['playing', 'map'].includes(state.phase)) return;
    // These endings already run in the map phase. Hold their last frame until
    // an authoritative snapshot opens the overworld or the earned bonus room.
    const next = state.tick + 1;
    if ((state.goalWalk && goalWalkFrame(state.goalWalk, next).finished) ||
        (state.keyholeFinish && keyholeFrame(state.keyholeFinish.tick, next).finished) ||
        (state.orbFinish && orbFinishFrame(state.orbFinish, next).finished)) return;
    const p = state.players;
    stepGame(this.campaign, state, {
      mario: this.playerId === 'mario' ? buttons : p.mario.lastInput,
      luigi: this.playerId === 'luigi' ? buttons : p.luigi.lastInput,
    });
  }
}
