import type { WebSocket } from 'ws';
import {
  createGame,
  stepGame,
  makeSave,
  type GameState,
  MAX_MULTIPLAYER_PLAYERS,
  type PlayerId,
  type PlayerProfile,
} from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
import type { OpenedGameSession } from '../game-sessions/game-sessions.service.ts';
import { Seat, send } from './seat.ts';

export const MAX_ROOM_PLAYERS = MAX_MULTIPLAYER_PLAYERS;
const MIN_COOP_PLAYERS = 2;
const DURABLE_INTERVAL_MS = 30_000;

type Participant = PlayerProfile & { seat: Seat; host: boolean };
type PersistResult = { revision: number; durableAt: Date };

export class Room {
  readonly participants = new Map<PlayerId, Participant>();
  state: GameState | null = null;
  status: 'waiting' | 'playing' | 'paused' | 'closed' = 'waiting';
  expiresAt: number | null = null;
  private revision: number;
  private checkpointSequence = 0;
  private lastSavedAt = 0;
  private persistTask: Promise<boolean> | null = null;
  private persistenceFailed = false;
  private endingDurable = false;
  private closing = false;
  private closeTask: Promise<void> | null = null;

  constructor(
    readonly code: string,
    private readonly opened: OpenedGameSession,
    private readonly onClose: () => void,
    private readonly persist: (
      sequence: number,
      expectedRevision: number,
      save: ReturnType<typeof makeSave>,
      state: GameState,
    ) => Promise<PersistResult>,
    private readonly finishSession: (status: 'COMPLETED' | 'INTERRUPTED' | 'ABANDONED', reason: string) => Promise<void>,
  ) {
    this.revision = opened.revision;
  }

  get sessionId() { return this.opened.id; }
  get campaignId() { return this.opened.campaignId; }
  get mode() { return this.opened.mode; }
  get hostId() { return this.opened.profile.id; }

  add(profile: PlayerProfile, socket: WebSocket) {
    if (this.status !== 'waiting' || this.expiresAt) throw Error('La sessione è già iniziata o chiusa.');
    if (this.participants.size >= MAX_ROOM_PLAYERS) throw Error(`La stanza può contenere al massimo ${MAX_ROOM_PLAYERS} giocatori.`);
    if (this.participants.has(profile.id)) throw Error('Sei già presente nella stanza.');
    const normalized = profile.nickname.trim().toLowerCase();
    if ([...this.participants.values()].some((member) => member.nickname.trim().toLowerCase() === normalized))
      throw Error('Il nickname è già usato nella stanza.');
    const member: Participant = {
      ...profile,
      nickname: profile.nickname.trim(),
      seat: new Seat(),
      host: profile.id === this.opened.profile.id,
    };
    this.participants.set(profile.id, member);
    this.connect(member, socket);
  }

  canJoin(accountId: string) {
    return this.opened.mode === 'coop' && this.status === 'waiting' && !this.expiresAt &&
      this.participants.size < MAX_ROOM_PLAYERS && !this.participants.has(accountId);
  }

  resume(accountId: string, token: string, socket: WebSocket) {
    const member = [...this.participants.values()].find((player) => player.seat.token === token);
    if (!member || member.id !== accountId || member.seat.socket || this.status === 'closed' || this.closing)
      throw Error('Rientro non disponibile.');
    this.connect(member, socket);
    return member.id;
  }

  private connect(member: Participant, socket: WebSocket) {
    member.seat.socket = socket;
    member.seat.claimed = true;
    member.seat.resetControls();
    send(socket, { v: 1, type: 'joined', code: this.code, playerId: member.id, token: member.seat.token });
    if ([...this.participants.values()].every((player) => player.seat.socket)) {
      this.expiresAt = null;
      if (this.state && !this.persistenceFailed && !this.persistTask) this.status = 'playing';
    }
    this.notify();
    if (this.state) this.snapshots();
  }

  setReady(id: PlayerId) {
    if (this.status !== 'waiting') throw Error('La partita è già iniziata.');
    this.requireParticipant(id).seat.ready = true;
    this.notify();
  }

  async start(id: PlayerId) {
    if (id !== this.opened.profile.id) throw Error('Solo chi ha creato la stanza può avviare la partita.');
    if (this.status !== 'waiting') throw Error('La partita è già iniziata.');
    const minimum = this.opened.mode === 'solo' ? 1 : MIN_COOP_PLAYERS;
    if (this.participants.size < minimum) throw Error(`Servono almeno ${minimum} giocatori per iniziare.`);
    const members = [...this.participants.values()];
    if (members.some((member) => !member.seat.socket || !member.seat.ready))
      throw Error('Tutti i giocatori presenti devono essere connessi e pronti.');
    const roster = members.map(({ id: playerId, nickname, character }) => ({ id: playerId, nickname, character }));
    this.state = createGame(this.opened.campaign, this.opened.save, this.opened.mode, roster);
    this.status = 'playing';
    this.expiresAt = null;
    this.notify();
    this.snapshots();
    await this.persistState();
  }

  push(id: PlayerId, seq: number, buttons: number) {
    this.requireParticipant(id).seat.push(seq, buttons);
  }

  detach(id: PlayerId) {
    const member = this.requireParticipant(id);
    member.seat.socket = null;
    for (const player of this.participants.values()) player.seat.resetControls();
    if (this.status === 'closed' || this.closing) return;
    this.expiresAt ??= Date.now() + 60_000;
    if (this.state) this.status = 'paused';
    this.notify();
  }

  step(now: number) {
    if (this.expiresAt !== null && now >= this.expiresAt) {
      void this.close('ABANDONED', 'RECONNECT_TIMEOUT');
      return;
    }
    if (this.status !== 'playing' || !this.state || this.closing) return;
    const state = this.state;
    const previousPhase = state.phase;
    const inputs = Object.fromEntries([...this.participants].map(([id, member]) => [id, member.seat.next()]));
    stepGame(this.opened.campaign, state, inputs);
    for (const event of state.events) this.broadcast({ v: 1, type: 'gameEvent', tick: state.tick, event });
    if (
      previousPhase !== state.phase ||
      state.events.some((event) => event.type === 'checkpoint' || event.type === 'exit' || event.type === 'gameOver') ||
      (state.phase !== 'ending' && Date.now() - this.lastSavedAt >= DURABLE_INTERVAL_MS)
    ) void this.persistState();
    if (state.tick % 2 === 0) this.snapshots();
  }

  snapshots() {
    if (!this.state) return;
    for (const member of this.participants.values())
      if (member.seat.socket) send(member.seat.socket, { v: 1, type: 'snapshot', state: this.state, ack: member.seat.ack });
  }

  notify() {
    const players = [...this.participants.values()].map(({ id, nickname, character, seat, host }) => ({
      id,
      nickname,
      character,
      host,
      ready: seat.ready,
      connected: !!seat.socket,
    }));
    this.broadcast({
      v: 1,
      type: 'roomState',
      code: this.code,
      status: this.status,
      hostId: this.opened.profile.id,
      players,
      expiresAt: this.expiresAt,
    });
  }

  async close(status: 'COMPLETED' | 'INTERRUPTED' | 'ABANDONED' = 'COMPLETED', reason = 'USER_LEFT') {
    if (this.closeTask) return this.closeTask;
    this.closing = true;
    this.expiresAt = null;
    if (this.status !== 'closed') this.status = 'paused';
    this.notify();
    this.closeTask = (async () => {
      let finalStatus = this.state ? status : 'ABANDONED';
      let finalReason = this.state ? reason : 'ROOM_NOT_STARTED';
      if (this.state) {
        if (this.persistTask) await this.persistTask;
        if (this.endingDurable) {
          finalStatus = 'COMPLETED';
          finalReason = 'FINAL';
        } else if (!this.persistenceFailed) {
          const persisted = await this.persistState();
          if (!persisted) {
            finalStatus = 'INTERRUPTED';
            finalReason = 'PERSIST_FAILED';
          }
        } else {
          finalStatus = 'INTERRUPTED';
          finalReason = 'PERSIST_FAILED';
        }
      }
      this.status = 'closed';
      this.notify();
      for (const member of this.participants.values()) member.seat.socket?.close(1000, 'Stanza chiusa');
      await this.finishSession(finalStatus, finalReason);
      this.onClose();
    })();
    return this.closeTask;
  }

  private persistState(): Promise<boolean> {
    if (!this.state) return Promise.resolve(true);
    if (this.persistTask) return this.persistTask;
    const state = this.state;
    const save = makeSave(state);
    const sequence = this.checkpointSequence + 1;
    const wasPlaying = this.status === 'playing';
    if (wasPlaying) {
      this.status = 'paused';
      this.notify();
    }
    const task = this.persist(sequence, this.revision, save, state)
      .then(({ revision, durableAt }) => {
        this.checkpointSequence = sequence;
        this.revision = revision;
        this.lastSavedAt = durableAt.getTime();
        this.persistenceFailed = false;
        if (state.phase === 'ending') this.endingDurable = true;
        this.broadcast({ v: 1, type: 'saved', campaignId: this.opened.campaignId, revision });
        if (!this.closing && this.expiresAt === null && [...this.participants.values()].every((member) => member.seat.socket)) {
          this.status = 'playing';
          this.notify();
        }
        return true;
      })
      .catch((error: unknown) => {
        this.persistenceFailed = true;
        this.status = 'paused';
        this.broadcast({
          v: 1,
          type: 'error',
          message: error instanceof Error ? `Salvataggio non riuscito: ${error.message}` : 'Salvataggio non riuscito.',
        });
        this.notify();
        return false;
      })
      .finally(() => {
        this.persistTask = null;
      });
    this.persistTask = task;
    return task;
  }

  private requireParticipant(id: PlayerId) {
    const member = this.participants.get(id);
    if (!member) throw Error('Giocatore non presente nella stanza.');
    return member;
  }

  private broadcast(message: ServerMessage) {
    for (const member of this.participants.values()) if (member.seat.socket) send(member.seat.socket, message);
  }
}
