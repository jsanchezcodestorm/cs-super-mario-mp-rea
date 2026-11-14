import { randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import { parseMessage } from '@smw/protocol';
import type { ClientMessage } from '@smw/protocol';
import type { AuthenticatedAccount } from '../security/request-context.ts';
import { GameSessionsService } from '../game-sessions/game-sessions.service.ts';
import { Room } from './room.ts';
import { send } from './seat.ts';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

type Session = { room: Room; id: string };
type ConnectionState = {
  account: AuthenticatedAccount;
  session: Session | null;
  messages: number;
  windowStart: number;
};

export class Lobby {
  readonly rooms = new Map<string, Room>();
  private readonly connections = new WeakMap<WebSocket, ConnectionState>();

  constructor(private readonly sessions: GameSessionsService) {}

  attach(socket: WebSocket, account: AuthenticatedAccount) {
    if (this.connections.has(socket)) throw Error('Il socket è già collegato alla lobby.');
    this.connections.set(socket, { account, session: null, messages: 0, windowStart: Date.now() });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      const connection = this.connections.get(socket);
      if (connection?.session) connection.session.room.detach(connection.session.id);
      this.connections.delete(socket);
    });
  }

  async receive(socket: WebSocket, raw: string, binary = false) {
    const connection = this.connections.get(socket);
    if (!connection) throw Error('Il socket non è autenticato.');
    if (Date.now() - connection.windowStart >= 1000) {
      connection.windowStart = Date.now();
      connection.messages = 0;
    }
    if (++connection.messages > 200 || binary) {
      socket.close(1008, 'Protocol violation');
      return;
    }

    try {
      const message = parseMessage(raw);
      if (!connection.session) {
        connection.session = await this.openRoom(socket, connection.account, message);
        return;
      }
      await this.handleRoomMessage(connection.session, message);
    } catch (error) {
      send(socket, {
        v: 1,
        type: 'error',
        message: error instanceof Error ? error.message : 'Operazione non riuscita.',
      });
    }
  }

  step() {
    const now = Date.now();
    for (const room of this.rooms.values()) room.step(now);
  }

  private async openRoom(socket: WebSocket, account: AuthenticatedAccount, message: ClientMessage): Promise<Session> {
    if (message.type === 'createRoom') {
      const opened = await this.sessions.open(account, message.campaignId, message.mode, message.character);
      let code: string;
      do {
        code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
      } while (this.rooms.has(code));
      const room = new Room(
        code,
        opened,
        () => this.rooms.delete(code),
        (sequence, revision, save, state) => this.sessions.persist(opened.id, opened.campaignId, sequence, revision, save, state),
        (status, reason) => this.sessions.close(opened.id, status, reason),
      );
      this.rooms.set(code, room);
      try {
        room.add(opened.profile, socket);
        if (opened.mode === 'solo') {
          room.setReady(account.id);
          await room.start(account.id);
        }
        return { room, id: account.id };
      } catch (error) {
        await room.close('ABANDONED', 'ROOM_SETUP_FAILED');
        throw error;
      }
    }
    if (message.type === 'joinRoom') {
      const room = this.rooms.get(message.code);
      if (!room || !room.canJoin(account.id)) throw Error('Stanza inesistente, piena o già avviata.');
      const profile = await this.sessions.join(room.sessionId, account, message.character);
      room.add(profile, socket);
      return { room, id: profile.id };
    }
    if (message.type === 'resume') {
      const room = this.rooms.get(message.code);
      if (!room) throw Error('Stanza inesistente o scaduta.');
      const id = room.resume(account.id, message.token, socket);
      return { room, id };
    }
    throw Error('Crea o raggiungi una stanza prima di inviare altri messaggi.');
  }

  private async handleRoomMessage(session: Session, message: ClientMessage) {
    const { room, id } = session;
    if (message.type === 'leave') {
      void room.close('COMPLETED', 'USER_LEFT');
      return;
    }
    if (message.type === 'ready') {
      room.setReady(id);
      return;
    }
    if (message.type === 'startRoom') {
      await room.start(id);
      return;
    }
    if (message.type === 'input') {
      if (room.status === 'playing') room.push(id, message.seq, message.buttons);
      return;
    }
    throw Error('Sei già in una stanza.');
  }
}
