import { copyState, stepGame, type CampaignDefinition, type GameState, type PlayerId } from '@smw/core';

export class Playback {
  state?: GameState;
  previous?: GameState;
  predicted?: GameState;
  sampledAt = 0;
  paused = false;
  private seq = 0;
  private pending: { seq: number; buttons: number }[] = [];
  constructor(
    public readonly campaign: CampaignDefinition,
    public readonly playerId: PlayerId,
    private transmit: (seq: number, buttons: number) => boolean,
  ) {}

  receive(state: GameState, ack: number) {
    this.previous = this.state;
    this.state = state;
    this.sampledAt = performance.now();
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
    if (!this.predicted || this.predicted.phase !== 'playing') return;
    const p = this.predicted.players;
    stepGame(this.campaign, this.predicted, {
      mario: this.playerId === 'mario' ? buttons : p.mario.lastInput,
      luigi: this.playerId === 'luigi' ? buttons : p.luigi.lastInput,
    });
  }
}
