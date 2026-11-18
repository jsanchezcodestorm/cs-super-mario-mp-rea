import { Body, Controller, Get, Inject, Put, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../security/request-context.ts';
import { requireIdentity } from '../security/request-context.ts';
import { SameOriginGuard } from '../security/same-origin.guard.ts';
import { SessionAuthGuard } from '../security/session-auth.guard.ts';
import { AccountsService } from './accounts.service.ts';

@Controller('/api/v1')
@UseGuards(SessionAuthGuard, SameOriginGuard)
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService) {}

  @Get('me')
  me(@Req() request: AuthenticatedRequest) {
    const identity = requireIdentity(request);
    return this.accounts.profileForIdentity(identity.id, identity.email);
  }

  @Put('me')
  updateProfile(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    const identity = requireIdentity(request);
    return this.accounts.saveNickname(identity.id, identity.email, body.nickname);
  }
}
