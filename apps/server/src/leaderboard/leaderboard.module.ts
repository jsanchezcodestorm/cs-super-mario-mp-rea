import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { PrismaModule } from '../database/prisma.module.ts';
import { LeaderboardController } from './leaderboard.controller.ts';
import { LeaderboardService } from './leaderboard.service.ts';

@Module({ imports: [AuthModule, PrismaModule], controllers: [LeaderboardController], providers: [LeaderboardService] })
export class LeaderboardModule {}
