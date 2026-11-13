import type { WebSocket } from 'ws';
import {
  createGame,
  stepGame,
  makeSave,
  type CampaignDefinition,
  type CampaignSave,
  type GameState,
  type PlayerId,
} from '@smw/core';
import type { CampaignRef, RoomStatus, ServerMessage } from '@smw/protocol';
import { Seat, send } from './seat.ts';

const ids = ['mario', 'luigi'] as const;

export class Room {
  readonly seats = { mario: new Seat(), luigi: new Seat() };
  state: GameState | null = null;
  status: RoomStatus = 'waiting';
  expiresAt: number | null = null;
  constructor(
    readonly code: string,
    private campaign: CampaignDefinition,
    private save: CampaignSave | undefined,
    private campaignRef: CampaignRef | undefined,
    private onClose: () => void,
  ) {}

  attach(id: PlayerId, socket: WebSocket) {
    const seat = this.seats[id];
    if (seat.socket || this.status === 'closed') throw Error('Questo posto è già occupato.');
    seat.socket = socket;
    seat.claimed = true;
    seat.resetControls();
    send(socket, { v: 1, type: 'joined', code: this.code, playerId: id, token: seat.token });
    if (ids.every((key) => !this.seats[key].claimed || this.seats[key].socket)) {
      this.expiresAt = null;
      if (this.state) this.status = 'playing';
    }
    this.notify();
    if (this.state) {
      this.saveCampaign();
      this.snapshots();
    }
  }

  setReady(id: PlayerId) {
    if (this.status !== 'waiting') throw Error('La partita è già iniziata.');
    this.seats[id].ready = true;
    if (ids.every((key) => this.seats[key].ready && this.seats[key].socket)) {
      this.state = createGame(this.campaign, this.save, 'coop');
      this.status = 'playing';
      this.saveCampaign();
    }
    this.notify();
    if (this.state) this.snapshots();
  }

  detach(id: PlayerId) {
    this.seats[id].socket = null;
    for (const seat of Object.values(this.seats)) seat.resetControls();
    if (this.status === 'closed') return;
    this.expiresAt ??= Date.now() + 60_000;
    if (this.state) this.status = 'paused';
    this.notify();
  }

  step(now: number) {
    if (this.expiresAt !== null && now >= this.expiresAt) {
      this.close();
      return;
    }
    if (this.status !== 'playing' || !this.state) return;
    const state = this.state,
      previousPhase = state.phase;
    stepGame(this.campaign, state, { mario: this.seats.mario.next(), luigi: this.seats.luigi.next() });
    for (const event of state.events) this.broadcast({ v: 1, type: 'gameEvent', tick: state.tick, event });
    if (
      previousPhase !== state.phase ||
      state.events.some((e) => e.type === 'checkpoint' || e.type === 'exit' || e.type === 'gameOver')
    ) {
      this.saveCampaign();
    }
    if (state.tick % 2 === 0) this.snapshots();
  }

  snapshots() {
    if (!this.state) return;
    for (const seat of Object.values(this.seats))
      if (seat.socket) send(seat.socket, { v: 1, type: 'snapshot', state: this.state, ack: seat.ack });
  }

  notify() {
    const info = (id: PlayerId) => ({ ready: this.seats[id].ready, connected: !!this.seats[id].socket });
    this.broadcast({
      v: 1,
      type: 'roomState',
      code: this.code,
      status: this.status,
      expiresAt: this.expiresAt,
      seats: { mario: info('mario'), luigi: info('luigi') },
    });
  }

  private broadcast(message: ServerMessage) {
    for (const seat of Object.values(this.seats)) if (seat.socket) send(seat.socket, message);
  }

  private saveCampaign() {
    if (!this.state) return;
    this.broadcast({
      v: 1,
      type: 'save',
      ...(this.campaignRef ? { campaign: this.campaignRef } : {}),
      save: makeSave(this.state),
    });
  }

  close() {
    if (this.status === 'closed') return;
    this.status = 'closed';
    this.notify();
    for (const seat of Object.values(this.seats)) seat.socket?.close(1000, 'Stanza chiusa');
    this.onClose();
  }
}
