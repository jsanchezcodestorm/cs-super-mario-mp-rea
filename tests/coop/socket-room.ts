import { once } from 'node:events';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocket, WebSocketServer } from 'ws';
import { Lobby } from '../../apps/server/src/lobby.ts';
import type { ClientMessage, ServerMessage } from '@smw/protocol';
import type { CampaignDefinition, CampaignSave } from '@smw/core';

class Client {
  readonly socket: WebSocket;
  joined?: Extract<ServerMessage, { type: 'joined' }>;
  save?: CampaignSave;
  error?: string;
  exits: string[] = [];
  endings: string[] = [];
  private seq = 0;
  private buttons = -1;
  private budget = 0;
  private windowStart = Date.now();

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', (raw) => {
      const message: ServerMessage = JSON.parse(raw.toString());
      if (message.type === 'joined') this.joined = message;
      if (message.type === 'save') this.save = message.save;
      if (message.type === 'error') this.error = message.message;
      if (message.type === 'gameEvent') {
        if (message.event.type === 'exit') this.exits.push(message.event.playerId + ':' + message.event.exit);
        if (message.event.type === 'ending') this.endings.push(message.event.playerId + ':' + message.event.roomId);
      }
    });
  }

  // A pong is ordered after all previously sent data on this connection.
  async flush() {
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error('Test client disconnected');
    const disconnected = new AbortController();
    const abort = (code: number) => disconnected.abort(new Error('Test client disconnected (' + code + ')'));
    this.socket.once('close', abort);
    try {
      const pong = once(this.socket, 'pong', { signal: disconnected.signal });
      this.socket.ping();
      await pong;
    } finally {
      this.socket.off('close', abort);
    }
    assert.equal(this.error, undefined);
  }

  async send(message: ClientMessage) {
    if (Date.now() - this.windowStart >= 1000) {
      this.windowStart = Date.now();
      this.budget = 0;
    }
    if (++this.budget >= 150) {
      await sleep(Math.max(0, 1010 - (Date.now() - this.windowStart)));
      this.windowStart = Date.now();
      this.budget = 1;
    }
    this.socket.send(JSON.stringify(message));
    await this.flush();
  }

  async input(buttons: number) {
    if (buttons === this.buttons) return;
    this.buttons = buttons;
    await this.send({ v: 1, type: 'input', buttons, seq: ++this.seq });
  }
}

export async function openTestRoom(campaign: CampaignDefinition, save?: CampaignSave) {
  const lobby = new Lobby(campaign);
  // Use the production lobby/room protocol with an explicit test frame clock.
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  server.on('connection', (socket) => lobby.connect(socket));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = 'ws://127.0.0.1:' + address.port;
  const mario = new Client(url), luigi = new Client(url);
  await Promise.all([mario, luigi].map((c) => once(c.socket, 'open')));
  await mario.send({ v: 1, type: 'createRoom', save });
  await luigi.send({ v: 1, type: 'joinRoom', code: mario.joined!.code });
  assert.equal(mario.joined!.playerId, 'mario');
  assert.equal(luigi.joined!.playerId, 'luigi');
  await Promise.all([mario, luigi].map((c) => c.send({ v: 1, type: 'ready' })));
  const room = lobby.rooms.get(mario.joined!.code)!;
  assert.ok(room.state);
  async function drive(a: number, b: number, frames = 1) {
    await Promise.all([mario.input(a), luigi.input(b)]);
    for (let i = 0; i < frames; i++) {
      room.step(Date.now());
      if ((i + 1) % 12 === 0) await Promise.all([mario.flush(), luigi.flush()]);
    }
  }
  async function close() {
    room.close();
    for (const client of [mario, luigi]) client.socket.terminate();
    await new Promise<void>((done) => server.close(() => done()));
  }
  return { mario, luigi, state: room.state, drive, close };
}
