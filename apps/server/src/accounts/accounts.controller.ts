import { Body, Controller, Get, Inject, Patch, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../security/request-context.ts';
import { requireAccount } from '../security/request-context.ts';
import { SameOriginGuard } from '../security/same-origin.guard.ts';
import { SessionAuthGuard } from '../security/session-auth.guard.ts';
import { AccountsService } from './accounts.service.ts';

@Controller('/api/v1')
@UseGuards(SessionAuthGuard, SameOriginGuard)
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService) {}

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    return requireAccount(request);
  }

  @Patch('me')
  updateProfile(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return this.accounts.updateNickname(requireAccount(request).id, body.nickname);
  }
}
