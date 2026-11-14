import { BadRequestException, Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../security/request-context.ts';
import { requireAccount } from '../security/request-context.ts';
import { SameOriginGuard } from '../security/same-origin.guard.ts';
import { SessionAuthGuard } from '../security/session-auth.guard.ts';
import { GameSessionsService } from './game-sessions.service.ts';

@Controller('/api/v1/me/sessions')
@UseGuards(SessionAuthGuard, SameOriginGuard)
export class GameSessionsController {
  constructor(@Inject(GameSessionsService) private readonly sessions: GameSessionsService) {}

  @Get()
  history(@Req() request: AuthenticatedRequest, @Query('page') pageValue?: string, @Query('pageSize') sizeValue?: string) {
    const page = parsePage(pageValue, 1);
    const pageSize = parsePage(sizeValue, 20);
    if (pageSize > 50) throw new BadRequestException('pageSize non può superare 50.');
    return this.sessions.history(requireAccount(request).id, page, pageSize);
  }
}

function parsePage(value: string | undefined, defaultValue: number) {
  const parsed = value === undefined ? defaultValue : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1_000_000)
    throw new BadRequestException('Paginazione non valida.');
  return parsed;
}
