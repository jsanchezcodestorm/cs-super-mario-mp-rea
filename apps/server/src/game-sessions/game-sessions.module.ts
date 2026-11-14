import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { CampaignModule } from '../campaign/campaign.module.ts';
import { PrismaModule } from '../database/prisma.module.ts';
import { GameSessionsController } from './game-sessions.controller.ts';
import { GameSessionsService, gameSessionsServiceProvider } from './game-sessions.service.ts';

@Module({
  imports: [AuthModule, CampaignModule, PrismaModule],
  controllers: [GameSessionsController],
  providers: [gameSessionsServiceProvider],
  exports: [GameSessionsService],
})
export class GameSessionsModule {}
