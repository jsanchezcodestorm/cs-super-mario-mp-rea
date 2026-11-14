import { Injectable } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import type { AuthenticatedAccount } from '../security/request-context.ts';

@Injectable()
export class SocketIdentityRegistry {
  private readonly requests = new WeakMap<IncomingMessage, AuthenticatedAccount>();
  private readonly sockets = new WeakMap<WebSocket, AuthenticatedAccount>();

  approveRequest(request: IncomingMessage, account: AuthenticatedAccount) {
    this.requests.set(request, account);
  }

  bindSocket(socket: WebSocket, request: IncomingMessage) {
    const account = this.requests.get(request);
    if (!account) return false;
    this.sockets.set(socket, account);
    this.requests.delete(request);
    return true;
  }

  accountFor(socket: WebSocket) {
    return this.sockets.get(socket) ?? null;
  }
}
