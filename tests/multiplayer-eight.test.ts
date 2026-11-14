import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import {
  Buttons,
  createGame,
  makeSave,
  stepGame,
  validateSave,
  type CampaignDefinition,
  type CampaignSave,
  type InputFrame,
  type PlayerProfile,
} from '@smw/core';
import type { ServerMessage } from '@smw/protocol';
import { Lobby } from '../apps/server/src/lobby.ts';

const campaign: CampaignDefinition = JSON.parse(readFileSync('generated/content.json', 'utf8'));
const roster: PlayerProfile[] = Array.from({ length: 8 }, (_, index) => ({
  id: `profile-${index + 1}`,
  nickname: `Giocatore ${index + 1}`,
  character: index % 2 === 0 ? 'mario' : 'luigi',
}));

test('core simulates eight distinct players and requires unanimous course confirmation', () => {
  const state = createGame(campaign, undefined, 'coop', roster);
  assert.equal(Object.keys(state.players).length, 8);
  assert.deepEqual(state.players['profile-7'].character, 'mario');
  const idle = Object.fromEntries(roster.map((profile) => [profile.id, 0])) as InputFrame;
  stepGame(campaign, state, { ...idle, 'profile-8': Buttons.action });
  assert.deepEqual(state.mapRequest?.confirmed, ['profile-8']);

  stepGame(campaign, state, idle);
  const sixConfirmations = Object.fromEntries(roster.map((profile, index) => [
    profile.id,
    index >= 1 && index <= 6 ? Buttons.action : 0,
  ])) as InputFrame;
  stepGame(campaign, state, sixConfirmations);
  assert.equal(state.mapRequest?.confirmed.length, 7);
  assert.equal(state.phase, 'map');

  stepGame(campaign, state, idle);
  stepGame(campaign, state, { ...idle, 'profile-1': Buttons.run });
  assert.equal(state.mapRequest, undefined);
  assert.equal(state.phase, 'map');

  const unanimous = createGame(campaign, undefined, 'coop', roster);
  stepGame(campaign, unanimous, { ...idle, 'profile-8': Buttons.action });
  stepGame(campaign, unanimous, idle);
  stepGame(campaign, unanimous, Object.fromEntries(roster.map((profile, index) => [
    profile.id,
    index < 7 ? Buttons.action : 0,
  ])) as InputFrame);
  assert.equal(unanimous.phase, 'playing');
});

test('version-one saves migrate resources to the first matching browser profiles', () => {
  const original = makeSave(createGame(campaign));
  const base = structuredClone(original);
  delete base.legacyResources;
  const previous: CampaignSave = {
    ...base,
    version: 1,
    resources: {
      mario: { ...original.resources.mario, form: 'cape' },
      luigi: { ...original.resources.luigi, form: 'fire' },
    },
  };
  assert.equal(validateSave(campaign, previous), true);
  const state = createGame(campaign, previous, 'coop', roster);
  assert.equal(state.players['profile-1'].form, 'cape');
  assert.equal(state.players['profile-2'].form, 'fire');
  assert.equal(state.players['profile-3'].form, 'small');
  const migrated = makeSave(state);
  assert.equal(migrated.version, 2);
  assert.equal(validateSave(campaign, migrated), true);
  const resumed = createGame(campaign, migrated, 'coop', [roster[0], roster[1]]);
  assert.equal(resumed.players['profile-1'].form, 'cape');
  assert.equal(resumed.players['profile-2'].form, 'fire');
});

class Client {
  readonly socket: WebSocket;
  roomCode?: string;
  private messages: ServerMessage[] = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.on('message', (raw) => this.messages.push(JSON.parse(raw.toString())));
  }

  async send(message: object) {
    if (this.socket.readyState !== WebSocket.OPEN) throw Error('Test client disconnected');
    this.socket.send(JSON.stringify({ v: 2, ...message }));
    const pong = once(this.socket, 'pong');
    this.socket.ping();
    await pong;
  }

  async take<T extends ServerMessage['type']>(type: T, predicate: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const index = this.messages.findIndex((message) => message.type === type && predicate(message as Extract<ServerMessage, { type: T }>));
      if (index >= 0) return this.messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw Error('Timeout waiting for ' + type);
  }
}

test('room accepts eight clients, blocks a ninth and routes each input by stable ID', async (t) => {
  const lobby = new Lobby(campaign);
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  server.on('connection', (socket) => lobby.connect(socket));
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const clients: Client[] = [];
  const url = 'ws://127.0.0.1:' + address.port;
  t.after(async () => {
    for (const room of lobby.rooms.values()) room.close();
    for (const client of clients) client.socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  for (let index = 0; index < 8; index++) {
    const client = new Client(url);
    clients.push(client);
    await once(client.socket, 'open');
    const player = roster[index];
    await client.send(index === 0
      ? { type: 'createRoom', profileId: player.id, nickname: player.nickname, character: player.character }
      : { type: 'joinRoom', code: clients[0].roomCode, profileId: player.id, nickname: player.nickname, character: player.character });
    const joined = await client.take('joined');
    if (index === 0) clients[0].roomCode = joined.code;
    else assert.equal(joined.code, clients[0].roomCode);
  }

  const ninth = new Client(url);
  clients.push(ninth);
  await once(ninth.socket, 'open');
  await ninth.send({ type: 'joinRoom', code: clients[0].roomCode, profileId: 'profile-9', nickname: 'Giocatore 9', character: 'mario' });
  assert.match((await ninth.take('error')).message, /8/);

  await Promise.all(clients.slice(0, 8).map((client) => client.send({ type: 'ready' })));
  const roomCode = clients[0].roomCode!;
  const room = lobby.rooms.get(roomCode)!;
  assert.equal(room.state, null, 'readiness alone must not start the room');
  await clients[1].send({ type: 'startRoom' });
  assert.match((await clients[1].take('error')).message, /creato/);
  await clients[0].send({ type: 'startRoom' });
  await clients[0].take('roomState', (message) => message.status === 'playing');
  assert.equal(Object.keys(room.state!.players).length, 8);
  for (const player of roster) {
    assert.equal(room.state!.players[player.id].nickname, player.nickname);
    assert.equal(room.state!.players[player.id].character, player.character);
  }

  await clients[7].send({ type: 'input', seq: 1, buttons: Buttons.right });
  room.step(Date.now());
  assert.equal(room.state!.players['profile-8'].lastInput, Buttons.right);
  assert.equal(room.state!.players['profile-7'].lastInput, 0);
});
