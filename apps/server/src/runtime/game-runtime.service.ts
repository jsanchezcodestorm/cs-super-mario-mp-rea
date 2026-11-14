import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { Lobby } from '../multiplayer/lobby.ts';

@Injectable()
export class GameRuntimeService implements OnModuleDestroy {
  private server: WebSocketServer | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly alive = new WeakSet<WebSocket>();

  constructor(@Inject(Lobby) private readonly lobby: Lobby) {}

  start(server: WebSocketServer) {
    if (this.server) throw new Error('Il runtime di gioco è già avviato.');
    this.server = server;

    const stepMs = 1000 / 60;
    let previous = performance.now();
    let debt = 0;
    this.tickTimer = setInterval(() => {
      const now = performance.now();
      debt += Math.min(now - previous, 125);
      previous = now;
      while (debt >= stepMs) {
        this.lobby.step();
        debt -= stepMs;
      }
    }, 4);
    this.tickTimer.unref();

    server.on('connection', this.watchConnection);
    this.heartbeatTimer = setInterval(() => {
      for (const socket of server.clients) {
        if (!this.alive.has(socket)) {
          socket.terminate();
          continue;
        }
        this.alive.delete(socket);
        socket.ping();
      }
    }, 20_000);
    this.heartbeatTimer.unref();
  }

  async onModuleDestroy() {
    await this.stop();
  }

  private readonly watchConnection = (socket: WebSocket) => {
    this.alive.add(socket);
    socket.on('pong', () => this.alive.add(socket));
  };

  private async stop() {
    if (!this.server) return;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.tickTimer = null;
    this.heartbeatTimer = null;
    this.server.off('connection', this.watchConnection);
    await Promise.all([...this.lobby.rooms.values()].map((room) => room.close('INTERRUPTED', 'SERVER_SHUTDOWN')));
    for (const socket of this.server.clients) socket.terminate();
    this.server = null;
  }
}
