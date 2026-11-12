import type { CampaignSave, GameEvent, GameState, PlayerId } from '@smw/core';

export type ClientMessage =
  | { v: 1; type: 'createRoom'; save?: CampaignSave }
  | { v: 1; type: 'joinRoom'; code: string }
  | { v: 1; type: 'resume'; code: string; token: string }
  | { v: 1; type: 'ready' | 'leave' }
  | { v: 1; type: 'input'; seq: number; buttons: number };

export type RoomStatus = 'waiting' | 'playing' | 'paused' | 'closed';
export type SeatInfo = { connected: boolean; ready: boolean };
export type ServerMessage =
  | { v: 1; type: 'joined'; code: string; playerId: PlayerId; token: string }
  | {
      v: 1;
      type: 'roomState';
      code: string;
      status: RoomStatus;
      seats: Record<PlayerId, SeatInfo>;
      expiresAt: number | null;
    }
  | { v: 1; type: 'snapshot'; state: GameState; ack: number }
  | { v: 1; type: 'save'; save: CampaignSave }
  | { v: 1; type: 'gameEvent'; tick: number; event: GameEvent }
  | { v: 1; type: 'error'; message: string };

export function parseMessage(raw: string): ClientMessage {
  const m: unknown = JSON.parse(raw);
  if (!m || typeof m !== 'object' || !('v' in m) || m.v !== 1 || !('type' in m))
    throw Error('Versione del protocollo incompatibile.');
  const codeOk = 'code' in m && typeof m.code === 'string' && /^[A-Z2-9]{6}$/.test(m.code);
  switch (m.type) {
    case 'createRoom':
    case 'ready':
    case 'leave':
      return m as ClientMessage;
    case 'joinRoom':
      if (codeOk) return m as ClientMessage;
      break;
    case 'resume':
      if (codeOk && 'token' in m && typeof m.token === 'string' && /^[a-f0-9]{48}$/.test(m.token))
        return m as ClientMessage;
      break;
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
        m.buttons <= 255
      )
        return m as ClientMessage;
      break;
  }
  throw Error('Messaggio di gioco non valido.');
}
