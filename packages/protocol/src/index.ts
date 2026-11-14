import type { GameEvent, GameState, PlayerCharacter, PlayerId, PlayerProfile } from '@smw/core';

export type CampaignRef = { id: string; name: string };
export type RoomPlayerInfo = PlayerProfile & {
  connected: boolean;
  ready: boolean;
  host: boolean;
};

export type ClientMessage =
  | { v: 1; type: 'createRoom'; campaignId: string; mode: 'solo' | 'coop'; character: PlayerCharacter }
  | { v: 1; type: 'joinRoom'; code: string; character: PlayerCharacter }
  | { v: 1; type: 'resume'; code: string; token: string }
  | { v: 1; type: 'ready' | 'startRoom' | 'leave' }
  | { v: 1; type: 'input'; seq: number; buttons: number };

export type RoomStatus = 'waiting' | 'playing' | 'paused' | 'closed';
export type ServerMessage =
  | { v: 1; type: 'joined'; code: string; playerId: PlayerId; token: string }
  | {
      v: 1;
      type: 'roomState';
      code: string;
      status: RoomStatus;
      hostId: PlayerId;
      players: RoomPlayerInfo[];
      expiresAt: number | null;
    }
  | { v: 1; type: 'snapshot'; state: GameState; ack: number }
  | { v: 1; type: 'saved'; campaignId: string; revision: number }
  | { v: 1; type: 'gameEvent'; tick: number; event: GameEvent }
  | { v: 1; type: 'error'; message: string };

export function parseMessage(raw: string): ClientMessage {
  const m: unknown = JSON.parse(raw);
  if (!m || typeof m !== 'object' || !('v' in m) || m.v !== 1 || !('type' in m))
    throw Error('Versione del protocollo incompatibile.');
  const codeOk = 'code' in m && typeof m.code === 'string' && /^[A-Z2-9]{6}$/.test(m.code);
  switch (m.type) {
    case 'createRoom':
      if (
        'campaignId' in m && typeof m.campaignId === 'string' && /^[0-9a-f-]{36}$/i.test(m.campaignId) &&
        'mode' in m && (m.mode === 'solo' || m.mode === 'coop') &&
        'character' in m && validCharacter(m.character)
      )
        return m as ClientMessage;
      break;
    case 'joinRoom':
      if (codeOk && 'character' in m && validCharacter(m.character)) return m as ClientMessage;
      break;
    case 'resume':
      if (codeOk && 'token' in m && typeof m.token === 'string' && /^[a-f0-9]{48}$/.test(m.token))
        return m as ClientMessage;
      break;
    case 'ready':
    case 'startRoom':
    case 'leave':
      return m as ClientMessage;
    case 'input':
      if (
        'seq' in m &&
        typeof m.seq === 'number' &&
        Number.isSafeInteger(m.seq) &&
        m.seq > 0 &&
        'buttons' in m &&
        typeof m.buttons === 'number' &&
        Number.isInteger(m.buttons) &&
        m.buttons >= 0 &&
        m.buttons <= 511
      )
        return m as ClientMessage;
      break;
  }
  throw Error('Messaggio di gioco non valido.');
}

function validCharacter(value: unknown): value is PlayerCharacter {
  return value === 'mario' || value === 'luigi';
}
