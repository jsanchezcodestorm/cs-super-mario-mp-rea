import type { ClientMessage, ServerMessage } from '@smw/protocol';

type Credentials = { code: string; token: string };
export type SessionCallbacks = {
  message: (message: ServerMessage) => void;
  disconnected: (resuming: boolean) => void;
};
const storageKey = 'smw.room.v1';
const profileStorageKey = 'smw.player-profile.v1';

export function browserPlayerId() {
  const id = localStorage.getItem(profileStorageKey);
  if (id && /^[0-9a-f-]{36}$/i.test(id)) return id;
  const created = crypto.randomUUID();
  localStorage.setItem(profileStorageKey, created);
  return created;
}

export class RoomConnection {
  private socket?: WebSocket;
  private retry?: number;
  private credentials: Credentials | null;
  private resumeBy = 0;

  constructor(private callbacks: SessionCallbacks) {
    const raw = sessionStorage.getItem(storageKey);
    this.credentials = raw ? (JSON.parse(raw) as Credentials) : null;
  }

  restore() {
    if (this.credentials) this.resume();
  }

  connect(first: ClientMessage) {
    this.closeSocket();
    const url = new URL('/ws', window.location.origin);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = (this.socket = new WebSocket(url));
    ws.onopen = () => this.send(first);
    ws.onmessage = ({ data }) => {
      const m: ServerMessage = JSON.parse(data);
      if (m.v !== 1) {
        this.leave();
        throw new Error('Protocollo WebSocket incompatibile.');
      }
      if (m.type === 'joined') {
        this.credentials = { code: m.code, token: m.token };
        sessionStorage.setItem(storageKey, JSON.stringify(this.credentials));
        this.resumeBy = 0;
      }
      if (m.type === 'roomState' && m.status === 'closed') this.reset();
      if (m.type === 'error' && first.type === 'resume') this.reset();
      this.callbacks.message(m);
    };
    ws.onclose = () => {
      if (ws !== this.socket) return;
      this.socket = undefined;
      this.resumeBy ||= Date.now() + 60_000;
      const resuming = this.credentials !== null && Date.now() < this.resumeBy;
      if (resuming) this.retry = window.setTimeout(() => this.resume(), 1000);
      else this.reset();
      this.callbacks.disconnected(resuming);
    };
  }

  send(message: ClientMessage) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  leave() {
    this.send({ v: 1, type: 'leave' });
    this.reset();
  }

  private resume() {
    if (this.credentials) this.connect({ v: 1, type: 'resume', ...this.credentials });
  }

  private reset() {
    this.credentials = null;
    sessionStorage.removeItem(storageKey);
    this.resumeBy = 0;
    this.closeSocket();
  }

  private closeSocket() {
    window.clearTimeout(this.retry);
    const ws = this.socket;
    this.socket = undefined;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      ws.close();
    }
  }
}
