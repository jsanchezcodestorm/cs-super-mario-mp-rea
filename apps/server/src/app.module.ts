import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { CampaignModule } from './campaign/campaign.module.ts';
import { CampaignsModule } from './campaigns/campaigns.module.ts';
import { ConfigurationModule } from './config/configuration.module.ts';
import type { ServerConfiguration } from './config/server-configuration.ts';
import { HttpModule } from './http/http.module.ts';
import { MultiplayerModule } from './multiplayer/multiplayer.module.ts';
import { AccountsModule } from './accounts/accounts.module.ts';
import { PlatformAuthModule } from './platform-auth/platform-auth.module.ts';
import { GameSessionsModule } from './game-sessions/game-sessions.module.ts';
import { LeaderboardModule } from './leaderboard/leaderboard.module.ts';
import { PrismaModule } from './database/prisma.module.ts';
import { RuntimeModule } from './runtime/runtime.module.ts';
import { SecurityModule } from './security/security.module.ts';
import { WebSocketModule } from './websocket/websocket.module.ts';

@Module({})
export class AppModule {
  static register(configuration: ServerConfiguration): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigurationModule.register(configuration),
        PrismaModule,
        PlatformAuthModule,
        SecurityModule,
        AccountsModule,
        CampaignModule,
        CampaignsModule,
        GameSessionsModule,
        LeaderboardModule,
        MultiplayerModule,
        RuntimeModule,
        WebSocketModule,
        HttpModule,
      ],
    };
  }
}
