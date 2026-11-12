import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGateway } from '../apps/server/src/gateway.ts';
import { parseMessage, type ServerMessage } from '@smw/protocol';
import { Buttons } from '@smw/core';

function peer(url: string) {
  const ws = new WebSocket(url),
    messages: ServerMessage[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  async function take<T extends ServerMessage['type']>(
    type: T,
    condition: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true,
  ) {
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      const i = messages.findIndex(
        (m) => m.type === type && condition(m as Extract<ServerMessage, { type: T }>),
      );
      if (i >= 0) return messages.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise((done) => setTimeout(done, 5));
    }
    throw Error('Timeout ' + type + ': ' + messages.map((m) => m.type).slice(-5));
  }
  return { ws, take, send: (m: object) => ws.send(JSON.stringify({ v: 1, ...m })) };
}

test('reject invalid or unversioned input frames', () => {
  for (const m of [
    { v: 2, type: 'ready' },
    { v: 1, type: 'input', seq: 1, buttons: -1 },
    { v: 1, type: 'resume', code: 'AAAAAA', token: 'x' },
  ])
    assert.throws(() => parseMessage(JSON.stringify(m)));
});

test('two network seats share authoritative state across disconnect and reconnect', async (t) => {
  const campaign = JSON.parse(readFileSync('generated/content.json', 'utf8'));
  const gateway = createGateway(campaign, resolve('apps/web/dist'), resolve('generated'));
  gateway.server.listen(0, '127.0.0.1');
  await once(gateway.server, 'listening');
  const addr = gateway.server.address();
  assert(addr && typeof addr === 'object');
  const url = 'ws://127.0.0.1:' + addr.port + '/ws';
  t.after(() => gateway.stop());
  const host = peer(url);
  await once(host.ws, 'open');
  host.send({ type: 'createRoom' });
  const first = await host.take('joined');
  host.ws.close();
  await once(host.ws, 'close');
  const a = peer(url),
    b = peer(url);
  await Promise.all([once(a.ws, 'open'), once(b.ws, 'open')]);
  a.send({ type: 'resume', code: first.code, token: first.token });
  await a.take('roomState', (m) => m.status === 'waiting' && m.expiresAt === null);
  b.send({ type: 'joinRoom', code: first.code });
  const second = await b.take('joined');
  assert.equal(second.playerId, 'luigi');
  a.send({ type: 'ready' });
  b.send({ type: 'ready' });
  await a.take('roomState', (m) => m.status === 'playing');
  const c = peer(url);
  await once(c.ws, 'open');
  c.send({ type: 'joinRoom', code: first.code });
  assert.match((await c.take('error')).message, /piena/);
  c.ws.close();
  a.send({ type: 'input', seq: 7, buttons: Buttons.right });
  a.send({ type: 'input', seq: 6, buttons: Buttons.left });
  const ack = await a.take('snapshot', (m) => m.ack === 7);
  const shared = await b.take('snapshot', (m) => m.state.tick === ack.state.tick);
  assert.deepEqual(ack.state.players, shared.state.players);
  b.ws.terminate();
  await a.take('roomState', (m) => m.status === 'paused');
  const room = gateway.lobby.rooms.get(first.code)!;
  const tick = room.state!.tick;
  for (let i = 0; i < 30; i++) room.step(Date.now());
  assert.equal(room.state!.tick, tick);
  const resume = peer(url);
  await once(resume.ws, 'open');
  resume.send({ type: 'resume', code: first.code, token: second.token });
  assert.equal((await resume.take('joined')).playerId, 'luigi');
  await resume.take('roomState', (m) => m.status === 'playing');
  const after = await resume.take('snapshot');
  assert(after.state.tick >= tick);
  a.send({ type: 'leave' });
  await resume.take('roomState', (m) => m.status === 'closed');
  assert.equal(gateway.lobby.rooms.size, 0);
  const http = 'http://127.0.0.1:' + addr.port;
  const rom = await fetch(http + '/Super%20Mario%20World.smc');
  assert.equal(rom.status, 404);
  const movie = await fetch(http + '/assets/movies/ending.mp4', { headers: { Range: 'bytes=0-31' } });
  assert.equal(movie.status, 206);
  assert.equal((await movie.arrayBuffer()).byteLength, 32);
  const atlas = await fetch(http + '/assets/title.png', { method: 'HEAD' });
  assert.equal(atlas.headers.get('content-type'), 'image/png');
});
