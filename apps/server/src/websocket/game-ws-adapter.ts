import type { INestApplicationContext } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import type { IncomingMessage } from 'node:http';
import type { ServerConfiguration } from '../config/server-configuration.ts';
import type { WebSocket } from 'ws';
import { AuthService } from '../auth/auth.service.ts';
import { readCookie } from '../security/request-context.ts';
import { SocketIdentityRegistry } from './socket-identity.registry.ts';

type VerifyClientInfo = { origin: string; req: IncomingMessage };
type VerifyClientDone = (accepted: boolean, code?: number, message?: string) => void;

export class GameWebSocketAdapter extends WsAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly configuration: ServerConfiguration,
    private readonly auth: AuthService,
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
        if (info.req.url !== '/ws' || !this.allowsOrigin(origin, info.req.headers.host)) {
          done(false, 403, 'Forbidden');
          return;
        }
        const token = readCookie(info.req, this.configuration.authCookieName);
        if (!token) {
          done(false, 401, 'Authentication required');
          return;
        }
        void this.auth.accountForSession(token).then((account) => {
          if (!account) {
            done(false, 401, 'Authentication required');
            return;
          }
          this.identities.approveRequest(info.req, account);
          done(true);
        }).catch(() => done(false, 503, 'Authentication unavailable'));
      },
    });
    server.on('connection', (socket: WebSocket, request: IncomingMessage) => {
      if (!this.identities.bindSocket(socket, request)) socket.close(1008, 'Authentication required');
    });
    return server;
  }

  private allowsOrigin(origin: string | undefined, host: string | undefined) {
    if (!origin) return false;
    try {
      if (new URL(origin).host === host) return true;
    } catch {
      return false;
    }
    return origin === this.configuration.webOrigin;
  }
}
