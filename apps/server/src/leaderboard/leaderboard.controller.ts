import { BadRequestException, Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { SameOriginGuard } from '../security/same-origin.guard.ts';
import { SessionAuthGuard } from '../security/session-auth.guard.ts';
import { LeaderboardService } from './leaderboard.service.ts';

@Controller('/api/v1/leaderboard')
@UseGuards(SessionAuthGuard, SameOriginGuard)
export class LeaderboardController {
  constructor(@Inject(LeaderboardService) private readonly leaderboard: LeaderboardService) {}

  @Get()
  list(
    @Query('metric') metric: string,
    @Query('mode') mode: string,
    @Query('page') pageValue?: string,
    @Query('pageSize') sizeValue?: string,
  ) {
    const page = parsePage(pageValue, 1);
    const pageSize = parsePage(sizeValue, 20);
    if (pageSize > 100) throw new BadRequestException('pageSize non può superare 100.');
    return this.leaderboard.list(metric, mode, page, pageSize);
  }
}

function parsePage(value: string | undefined, defaultValue: number) {
  const parsed = value === undefined ? defaultValue : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000_000)
    throw new BadRequestException('Paginazione non valida.');
  return parsed;
}
