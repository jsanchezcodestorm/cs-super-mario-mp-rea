import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.ts';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module.ts';
import { MultiplayerModule } from '../multiplayer/multiplayer.module.ts';
import { RuntimeModule } from '../runtime/runtime.module.ts';
import { MultiplayerGateway } from './multiplayer.gateway.ts';
import { GameSocketIdentityService } from './game-socket-identity.service.ts';
import { SocketIdentityRegistry } from './socket-identity.registry.ts';

@Module({
  imports: [AccountsModule, PlatformAuthModule, MultiplayerModule, RuntimeModule],
  providers: [GameSocketIdentityService, SocketIdentityRegistry, MultiplayerGateway],
  exports: [GameSocketIdentityService],
})
export class WebSocketModule {}
