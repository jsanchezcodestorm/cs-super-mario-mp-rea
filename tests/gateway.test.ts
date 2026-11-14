import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { once } from 'node:events';
import { createServerApplication } from '../apps/server/src/create-application.ts';
import { Lobby } from '../apps/server/src/multiplayer/lobby.ts';
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

test('accept v1 protocol messages', () => {
  assert.deepEqual(parseMessage(JSON.stringify({ v: 1, type: 'ready' })), { v: 1, type: 'ready' });
});

test('two network seats share authoritative state across disconnect and reconnect', async (t) => {
  const app = await createServerApplication({
    host: '127.0.0.1',
    port: 0,
    webOrigin: 'https://allowed.example',
  });
  await app.listen(0, '127.0.0.1');
  const server = app.getHttpServer();
  const addr = server.address();
  assert(addr && typeof addr === 'object');
  const url = 'ws://127.0.0.1:' + addr.port + '/ws';
  t.after(() => app.close());

  const deniedOrigin = new WebSocket(url, { headers: { Origin: 'https://blocked.example' } });
  await assert.rejects(once(deniedOrigin, 'open'), /403/);
  const allowedOrigin = new WebSocket(url, { headers: { Origin: 'https://allowed.example' } });
  await once(allowedOrigin, 'open');
  const allowedOriginClosed = once(allowedOrigin, 'close');
  allowedOrigin.close();
  await allowedOriginClosed;
  const sameOrigin = new WebSocket(url, { headers: { Origin: 'http://127.0.0.1:' + addr.port } });
  await once(sameOrigin, 'open');
  const sameOriginClosed = once(sameOrigin, 'close');
  sameOrigin.close();
  await sameOriginClosed;
  const wrongPath = new WebSocket(url.replace('/ws', '/wrong'));
  await assert.rejects(once(wrongPath, 'open'));

  const binary = new WebSocket(url);
  await once(binary, 'open');
  const binaryClosed = once(binary, 'close');
  binary.send(Buffer.from('{"v":2,"type":"ready"}'), { binary: true });
  const [binaryCloseCode] = await binaryClosed;
  assert.equal(binaryCloseCode, 1008);

  const oversized = new WebSocket(url);
  await once(oversized, 'open');
  const oversizedClosed = once(oversized, 'close');
  oversized.send('x'.repeat(32 * 1024 + 1));
  const [oversizedCloseCode] = await oversizedClosed;
  assert.equal(oversizedCloseCode, 1009);

  const host = peer(url);
  await once(host.ws, 'open');
  host.send({ type: 'createRoom', profileId: 'mario', nickname: 'Mario', character: 'mario' });
  const first = await host.take('joined');
  host.ws.close();
  await once(host.ws, 'close');
  const a = peer(url),
    b = peer(url);
  await Promise.all([once(a.ws, 'open'), once(b.ws, 'open')]);
  a.send({ type: 'resume', code: first.code, token: first.token });
  await a.take('roomState', (m) => m.status === 'waiting' && m.expiresAt === null);
  b.send({ type: 'joinRoom', code: first.code, profileId: 'luigi', nickname: 'Luigi', character: 'luigi' });
  const second = await b.take('joined');
  assert.equal(second.playerId, 'luigi');
  a.send({ type: 'ready' });
  b.send({ type: 'ready' });
  await a.take('roomState', (m) => m.players.length === 2 && m.players.every((player) => player.ready));
  a.send({ type: 'startRoom' });
  await a.take('roomState', (m) => m.status === 'playing');
  const c = peer(url);
  await once(c.ws, 'open');
  c.send({
    type: 'joinRoom',
    code: first.code,
    profileId: 'profile-3',
    nickname: 'Giocatore 3',
    character: 'mario',
  });
  assert.match((await c.take('error')).message, /piena/);
  c.ws.close();
  a.send({ type: 'input', seq: 7, buttons: Buttons.right });
  a.send({ type: 'input', seq: 6, buttons: Buttons.left });
  const ack = await a.take('snapshot', (m) => m.ack === 7);
  const shared = await b.take('snapshot', (m) => m.state.tick === ack.state.tick);
  assert.deepEqual(ack.state.players, shared.state.players);
  b.ws.terminate();
  await a.take('roomState', (m) => m.status === 'paused');
  const lobby = app.get(Lobby);
  const room = lobby.rooms.get(first.code)!;
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
  assert.equal(lobby.rooms.size, 0);
  const http = 'http://127.0.0.1:' + addr.port;
  const health = await fetch(http + '/health');
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok' });
  assert.equal((await fetch(http + '/health', { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(http + '/health', { method: 'POST' })).status, 405);
  const rom = await fetch(http + '/Super%20Mario%20World.smc');
  assert.equal(rom.status, 404);
  const movie = await fetch(http + '/assets/movies/ending.mp4', { headers: { Range: 'bytes=0-31' } });
  assert.equal(movie.status, 206);
  assert.equal((await movie.arrayBuffer()).byteLength, 32);
  const atlas = await fetch(http + '/assets/title.png', { method: 'HEAD' });
  assert.equal(atlas.headers.get('content-type'), 'image/png');
});
