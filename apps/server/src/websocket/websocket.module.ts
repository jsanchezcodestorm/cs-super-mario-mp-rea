import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { MultiplayerModule } from '../multiplayer/multiplayer.module.ts';
import { RuntimeModule } from '../runtime/runtime.module.ts';
import { MultiplayerGateway } from './multiplayer.gateway.ts';
import { SocketIdentityRegistry } from './socket-identity.registry.ts';

@Module({
  imports: [AuthModule, MultiplayerModule, RuntimeModule],
  providers: [SocketIdentityRegistry, MultiplayerGateway],
  exports: [SocketIdentityRegistry],
})
export class WebSocketModule {}
