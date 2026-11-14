import { randomInt } from 'node:crypto';
import type { WebSocket } from 'ws';
import { validateSave, type CampaignDefinition, type PlayerProfile } from '@smw/core';
import { parseMessage } from '@smw/protocol';
import { Room } from './room.ts';
import { send } from './seat.ts';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Lobby {
  readonly rooms = new Map<string, Room>();
  constructor(private campaign: CampaignDefinition) {}

  connect(socket: WebSocket) {
    let session: { room: Room; id: string } | null = null;
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
        const message = parseMessage(raw.toString());
        if (!session) {
          let room: Room, id: string;
          if (message.type === 'createRoom') {
            if (message.save !== undefined && !validateSave(this.campaign, message.save))
              throw Error('Salvataggio incompatibile.');
            let code: string;
            do {
              code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
            } while (this.rooms.has(code));
            const profile = profileFromMessage(message);
            room = new Room(code, this.campaign, message.save, message.campaign, profile.id, () => this.rooms.delete(code));
            this.rooms.set(code, room);
            room.add(profile, socket);
            id = profile.id;
          } else if (message.type === 'joinRoom') {
            room = this.rooms.get(message.code)!;
            if (!room) throw Error('Stanza inesistente o scaduta.');
            const profile = profileFromMessage(message);
            room.add(profile, socket);
            id = profile.id;
          } else if (message.type === 'resume') {
            room = this.rooms.get(message.code)!;
            if (!room) throw Error('Stanza inesistente o scaduta.');
            id = room.resume(message.token, socket);
          } else throw Error('Entra prima in una stanza.');
          session = { room, id };
        } else {
          const { room, id } = session;
          if (message.type === 'leave') {
            room.close();
            return;
          }
          if (message.type === 'ready') {
            room.setReady(id);
            return;
          }
          if (message.type === 'startRoom') {
            room.start(id);
            return;
          }
          if (message.type === 'input') {
            if (room.status === 'playing') room.push(id, message.seq, message.buttons);
            return;
          }
          throw Error('Sei già in una stanza.');
        }
      } catch (error) {
        send(socket, {
          v: 2,
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

function profileFromMessage(message: Extract<import('@smw/protocol').ClientMessage, { type: 'createRoom' | 'joinRoom' }>): PlayerProfile {
  return { id: message.profileId, nickname: message.nickname.trim(), character: message.character };
}
