import type { WebSocket } from 'ws';
import {
  createGame,
  stepGame,
  makeSave,
  type CampaignDefinition,
  type CampaignSave,
  type GameState,
  MAX_MULTIPLAYER_PLAYERS,
  type PlayerId,
  type PlayerProfile,
} from '@smw/core';
import type { CampaignRef, RoomPlayerInfo, RoomStatus, ServerMessage } from '@smw/protocol';
import { Seat, send } from './seat.ts';

export const MAX_ROOM_PLAYERS = MAX_MULTIPLAYER_PLAYERS;
const MIN_ROOM_PLAYERS = 2;

type Participant = PlayerProfile & { seat: Seat; host: boolean };

export class Room {
  readonly participants = new Map<PlayerId, Participant>();
  state: GameState | null = null;
  status: RoomStatus = 'waiting';
  expiresAt: number | null = null;

  constructor(
    readonly code: string,
    private campaign: CampaignDefinition,
    private save: CampaignSave | undefined,
    private campaignRef: CampaignRef | undefined,
    readonly hostId: PlayerId,
    private onClose: () => void,
  ) {}

  add(profile: PlayerProfile, socket: WebSocket) {
    if (this.status !== 'waiting' || this.expiresAt) throw Error('Stanza piena o in corso.');
    if (this.participants.size >= MAX_ROOM_PLAYERS)
      throw Error(`La stanza può contenere al massimo ${MAX_ROOM_PLAYERS} giocatori.`);
    if (this.participants.has(profile.id)) throw Error('Questo profilo è già nella stanza.');
    const normalized = profile.nickname.trim().toLowerCase();
    if ([...this.participants.values()].some((member) => member.nickname.trim().toLowerCase() === normalized))
      throw Error('Il nickname è già usato nella stanza.');
    const member: Participant = { ...profile, nickname: profile.nickname.trim(), seat: new Seat(), host: profile.id === this.hostId };
    this.participants.set(profile.id, member);
    this.connect(member, socket);
  }

  resume(token: string, socket: WebSocket) {
    const member = [...this.participants.values()].find((player) => player.seat.token === token);
    if (!member || member.seat.socket || this.status === 'closed') throw Error('Rientro non disponibile.');
    this.connect(member, socket);
    return member.id;
  }

  private connect(member: Participant, socket: WebSocket) {
    member.seat.socket = socket;
    member.seat.claimed = true;
    member.seat.resetControls();
    send(socket, { v: 2, type: 'joined', code: this.code, playerId: member.id, token: member.seat.token });
    if ([...this.participants.values()].every((player) => player.seat.socket)) {
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
    this.requireParticipant(id).seat.ready = true;
    this.notify();
  }

  start(id: PlayerId) {
    if (id !== this.hostId) throw Error('Solo chi ha creato la stanza può avviare la partita.');
    if (this.status !== 'waiting') throw Error('La partita è già iniziata.');
    if (this.participants.size < MIN_ROOM_PLAYERS) throw Error('Servono almeno due giocatori per iniziare.');
    const members = [...this.participants.values()];
    if (members.some((member) => !member.seat.socket || !member.seat.ready))
      throw Error('Tutti i giocatori presenti devono essere connessi e pronti.');
    const roster = members.map(({ id: playerId, nickname, character }) => ({ id: playerId, nickname, character }));
    this.state = createGame(this.campaign, this.save, 'coop', roster);
    this.status = 'playing';
    this.expiresAt = null;
    this.saveCampaign();
    this.notify();
    this.snapshots();
  }

  push(id: PlayerId, seq: number, buttons: number) {
    this.requireParticipant(id).seat.push(seq, buttons);
  }

  detach(id: PlayerId) {
    const member = this.requireParticipant(id);
    member.seat.socket = null;
    for (const player of this.participants.values()) player.seat.resetControls();
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
    const state = this.state;
    const previousPhase = state.phase;
    const inputs = Object.fromEntries([...this.participants].map(([id, member]) => [id, member.seat.next()]));
    stepGame(this.campaign, state, inputs);
    for (const event of state.events) this.broadcast({ v: 2, type: 'gameEvent', tick: state.tick, event });
    if (
      previousPhase !== state.phase ||
      state.events.some((event) => event.type === 'checkpoint' || event.type === 'exit' || event.type === 'gameOver')
    ) this.saveCampaign();
    if (state.tick % 2 === 0) this.snapshots();
  }

  snapshots() {
    if (!this.state) return;
    for (const member of this.participants.values())
      if (member.seat.socket) send(member.seat.socket, { v: 2, type: 'snapshot', state: this.state, ack: member.seat.ack });
  }

  notify() {
    const players: RoomPlayerInfo[] = [...this.participants.values()].map(({ id, nickname, character, seat, host }) => ({
      id,
      nickname,
      character,
      host,
      ready: seat.ready,
      connected: !!seat.socket,
    }));
    this.broadcast({ v: 2, type: 'roomState', code: this.code, status: this.status, hostId: this.hostId, players, expiresAt: this.expiresAt });
  }

  private requireParticipant(id: PlayerId) {
    const member = this.participants.get(id);
    if (!member) throw Error('Giocatore non presente nella stanza.');
    return member;
  }

  private broadcast(message: ServerMessage) {
    for (const member of this.participants.values()) if (member.seat.socket) send(member.seat.socket, message);
  }

  private saveCampaign() {
    if (!this.state) return;
    this.broadcast({
      v: 2,
      type: 'save',
      ...(this.campaignRef ? { campaign: this.campaignRef } : {}),
      save: makeSave(this.state),
    });
  }

  close() {
    if (this.status === 'closed') return;
    this.status = 'closed';
    this.notify();
    for (const member of this.participants.values()) member.seat.socket?.close(1000, 'Stanza chiusa');
    this.onClose();
  }
}
