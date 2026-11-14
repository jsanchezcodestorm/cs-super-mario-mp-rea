import { Inject } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayInit } from '@nestjs/websockets';
import { WebSocket, WebSocketServer } from 'ws';
import { Lobby } from '../multiplayer/lobby.ts';
import { GameRuntimeService } from '../runtime/game-runtime.service.ts';
import { SocketIdentityRegistry } from './socket-identity.registry.ts';

@WebSocketGateway({ path: '/ws', maxPayload: 32768, perMessageDeflate: false })
export class MultiplayerGateway implements OnGatewayInit<WebSocketServer>, OnGatewayConnection<WebSocket> {
  constructor(
    @Inject(Lobby) private readonly lobby: Lobby,
    @Inject(GameRuntimeService) private readonly runtime: GameRuntimeService,
    @Inject(SocketIdentityRegistry) private readonly identities: SocketIdentityRegistry,
  ) {}

  afterInit(server: WebSocketServer) {
    this.runtime.start(server);
  }

  handleConnection(socket: WebSocket) {
    const account = this.identities.accountFor(socket);
    if (!account) {
      socket.close(1008, 'Authentication required');
      return;
    }
    this.lobby.attach(socket, account);
    socket.on('message', (_raw, binary) => {
      if (binary) socket.close(1008, 'Protocol violation');
    });
  }

  @SubscribeMessage('protocol')
  handleMessage(@ConnectedSocket() socket: WebSocket, @MessageBody() raw: string) {
    void this.lobby.receive(socket, raw);
  }
}
