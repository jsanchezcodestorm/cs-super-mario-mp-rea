import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.ts';
import { SecurityModule } from '../security/security.module.ts';
import { LeaderboardController } from './leaderboard.controller.ts';
import { LeaderboardService } from './leaderboard.service.ts';

@Module({ imports: [PrismaModule, SecurityModule], controllers: [LeaderboardController], providers: [LeaderboardService] })
export class LeaderboardModule {}
