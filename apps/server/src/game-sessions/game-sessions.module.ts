import { Module } from '@nestjs/common';
import { CampaignModule } from '../campaign/campaign.module.ts';
import { PrismaModule } from '../database/prisma.module.ts';
import { SecurityModule } from '../security/security.module.ts';
import { GameSessionsController } from './game-sessions.controller.ts';
import { GameSessionsService, gameSessionsServiceProvider } from './game-sessions.service.ts';

@Module({
  imports: [CampaignModule, PrismaModule, SecurityModule],
  controllers: [GameSessionsController],
  providers: [gameSessionsServiceProvider],
  exports: [GameSessionsService],
})
export class GameSessionsModule {}
