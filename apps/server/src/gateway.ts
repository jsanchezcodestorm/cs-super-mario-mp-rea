import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import type { CampaignDefinition } from '@smw/core';
import { Lobby } from './lobby.ts';
import { staticHandler } from './static.ts';

export function createGateway(
  campaign: CampaignDefinition,
  dist: string,
  assets: string,
  allowOrigin?: string,
) {
  const lobby = new Lobby(campaign);
  const server = createServer(staticHandler(dist, assets));
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 32768, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    let sameOrigin = false;
    try {
      sameOrigin = !!origin && new URL(origin).host === req.headers.host;
    } catch {}
    if (req.url !== '/ws' || (origin && !sameOrigin && origin !== allowOrigin)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit('connection', ws, req));
  });
  const stepMs = 1000 / 60;
  let previous = performance.now(),
    debt = 0;
  const timer = setInterval(() => {
    const now = performance.now();
    debt += Math.min(now - previous, 125);
    previous = now;
    while (debt >= stepMs) {
      lobby.step();
      debt -= stepMs;
    }
  }, 4);
  timer.unref();
  const alive = new WeakSet();
  sockets.on('connection', (ws) => {
    lobby.connect(ws);
    alive.add(ws);
    ws.on('pong', () => alive.add(ws));
  });
  // The noServer upgrade callback owns acceptance and handshake.
  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!alive.has(ws)) {
        ws.terminate();
        continue;
      }
      alive.delete(ws);
      ws.ping();
    }
  }, 20000);
  heartbeat.unref();
  server.once('close', () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    sockets.close();
  });
  return {
    server,
    lobby,
    stop() {
      for (const room of lobby.rooms.values()) room.close();
      for (const ws of sockets.clients) ws.terminate();
      return new Promise<void>((done) => server.close(() => done()));
    },
  };
}
