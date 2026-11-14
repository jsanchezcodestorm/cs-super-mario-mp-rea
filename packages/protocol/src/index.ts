import type { CampaignSave, GameEvent, GameState, PlayerCharacter, PlayerId, PlayerProfile } from '@smw/core';

export type CampaignRef = { id: string; name: string };
export type RoomPlayerInfo = PlayerProfile & {
  connected: boolean;
  ready: boolean;
  host: boolean;
};

export type ClientMessage =
  | { v: 2; type: 'createRoom'; profileId: PlayerId; nickname: string; character: PlayerCharacter; campaign?: CampaignRef; save?: CampaignSave }
  | { v: 2; type: 'joinRoom'; code: string; profileId: PlayerId; nickname: string; character: PlayerCharacter }
  | { v: 2; type: 'resume'; code: string; token: string }
  | { v: 2; type: 'ready' | 'startRoom' | 'leave' }
  | { v: 2; type: 'input'; seq: number; buttons: number };

export type RoomStatus = 'waiting' | 'playing' | 'paused' | 'closed';
export type ServerMessage =
  | { v: 2; type: 'joined'; code: string; playerId: PlayerId; token: string }
  | {
      v: 2;
      type: 'roomState';
      code: string;
      status: RoomStatus;
      hostId: PlayerId;
      players: RoomPlayerInfo[];
      expiresAt: number | null;
    }
  | { v: 2; type: 'snapshot'; state: GameState; ack: number }
  | { v: 2; type: 'save'; campaign?: CampaignRef; save: CampaignSave }
  | { v: 2; type: 'gameEvent'; tick: number; event: GameEvent }
  | { v: 2; type: 'error'; message: string };

export function parseMessage(raw: string): ClientMessage {
  const m: unknown = JSON.parse(raw);
  if (!m || typeof m !== 'object' || !('v' in m) || m.v !== 2 || !('type' in m))
    throw Error('Versione del protocollo incompatibile.');
  const codeOk = 'code' in m && typeof m.code === 'string' && /^[A-Z2-9]{6}$/.test(m.code);
  switch (m.type) {
    case 'createRoom':
      if (validPlayer(m) && (!('campaign' in m) || m.campaign === undefined || validCampaignRef(m.campaign)))
        return m as ClientMessage;
      break;
    case 'joinRoom':
      if (codeOk && validPlayer(m)) return m as ClientMessage;
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

function validPlayer(value: Record<string, unknown>) {
  return (
    typeof value.profileId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.profileId) &&
    typeof value.nickname === 'string' && value.nickname.trim().length > 0 && value.nickname.trim().length <= 24 &&
    (value.character === 'mario' || value.character === 'luigi')
  );
}

function validCampaignRef(value: unknown): value is CampaignRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return (
    typeof ref.id === 'string' && /^[0-9a-f-]{36}$/i.test(ref.id) &&
    typeof ref.name === 'string' && ref.name.trim().length > 0 && ref.name.length <= 48
  );
}
