import type { INestApplicationContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import type { IncomingMessage } from 'node:http';
import type { ServerConfiguration } from '../config/server-configuration.ts';
import type { WebSocket } from 'ws';
import { GameSocketIdentityService, requireGameSocketIdentity } from './game-socket-identity.service.ts';
import { SocketIdentityRegistry } from './socket-identity.registry.ts';

type VerifyClientInfo = { origin: string; req: IncomingMessage };
type VerifyClientDone = (accepted: boolean, code?: number, message?: string) => void;

export class GameWebSocketAdapter extends WsAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly configuration: ServerConfiguration,
    private readonly identitiesResolver: GameSocketIdentityService,
    private readonly identities: SocketIdentityRegistry,
  ) {
    super(app, {
      messageParser: (data) => ({ event: 'protocol', data: data.toString() }),
      maxConcurrentMessages: Infinity,
    });
  }

  override create(
    port: number,
    options: Record<string, any> & { namespace?: string; server?: any; path?: string } = {},
  ) {
    const server = super.create(port, {
      ...options,
      verifyClient: (info: VerifyClientInfo, done: VerifyClientDone) => {
        const originHeader = info.origin || info.req.headers.origin;
        const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
        if (info.req.url !== '/ws' || !this.allowsOrigin(origin)) {
          done(false, 403, 'Forbidden');
          return;
        }
        void requireGameSocketIdentity(this.identitiesResolver, info.req).then((account) => {
          this.identities.approveRequest(info.req, account);
          done(true);
        }).catch((error: unknown) => {
          const status = error instanceof HttpException ? error.getStatus() : 503;
          done(false, status, status === 403 ? 'Membership required' : 'Authentication unavailable');
        });
      },
    });
    server.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      if (!this.identities.bindSocket(socket, request)) socket.close(1008, 'Authentication required');
    });
    return server;
  }

  private allowsOrigin(origin: string | undefined) {
    return origin === this.configuration.webOrigin;
  }
}
