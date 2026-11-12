import { randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import { validateSave, type CampaignDefinition, type PlayerId } from '@smw/core';
import { parseMessage } from '@smw/protocol';
import { Room } from './room.ts';
import { send } from './seat.ts';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export class Lobby {
  readonly rooms = new Map<string, Room>();
  constructor(private campaign: CampaignDefinition) {}

  connect(socket: WebSocket) {
    let session: { room: Room; id: PlayerId } | null = null;
    let messages = 0,
      windowStart = Date.now();
    socket.on('error', () => socket.terminate());
    socket.on('message', (raw, binary) => {
      if (Date.now() - windowStart >= 1000) {
        windowStart = Date.now();
        messages = 0;
      }
      if (++messages > 200 || binary) {
        socket.close(1008, 'Protocol violation');
        return;
      }
      try {
        const m = parseMessage(raw.toString());
        if (!session) {
          let room: Room, id: PlayerId;
          if (m.type === 'createRoom') {
            if (m.save !== undefined && !validateSave(this.campaign, m.save))
              throw Error('Salvataggio incompatibile.');
            let code: string;
            do {
              code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
            } while (this.rooms.has(code));
            room = new Room(code, this.campaign, m.save, () => this.rooms.delete(code));
            this.rooms.set(code, room);
            id = 'mario';
          } else if (m.type === 'joinRoom' || m.type === 'resume') {
            const found = this.rooms.get(m.code);
            if (!found) throw Error('Stanza inesistente o scaduta.');
            room = found;
            if (m.type === 'joinRoom') {
              if (room.status !== 'waiting' || room.expiresAt || room.seats.luigi.claimed)
                throw Error('Stanza piena o in corso.');
              id = 'luigi';
            } else {
              const owner = (['mario', 'luigi'] as const).find((key) => room.seats[key].token === m.token);
              if (!owner || room.seats[owner].socket) throw Error('Rientro non disponibile.');
              id = owner;
            }
          } else throw Error('Entra prima in una stanza.');
          room.attach(id, socket);
          session = { room, id };
        } else {
          const { room, id } = session;
          if (m.type === 'leave') {
            room.close();
            return;
          }
          if (m.type === 'ready') {
            room.setReady(id);
            return;
          }
          if (m.type === 'input') {
            if (room.status === 'playing') room.seats[id].push(m.seq, m.buttons);
            return;
          }
          throw Error('Sei già in una stanza.');
        }
      } catch (error) {
        send(socket, {
          v: 1,
          type: 'error',
          message: error instanceof SyntaxError ? 'JSON non valido.' : (error as Error).message,
        });
      }
    });
    socket.on('close', () => {
      if (session) session.room.detach(session.id);
    });
  }

  step() {
    const now = Date.now();
    for (const room of this.rooms.values()) room.step(now);
  }
}
