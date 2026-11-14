import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../security/request-context.ts';
import { requireAccount } from '../security/request-context.ts';
import { SameOriginGuard } from '../security/same-origin.guard.ts';
import { SessionAuthGuard } from '../security/session-auth.guard.ts';
import { CampaignsService } from './campaigns.service.ts';

@Controller('/api/v1')
@UseGuards(SessionAuthGuard, SameOriginGuard)
export class CampaignsController {
  constructor(@Inject(CampaignsService) private readonly campaigns: CampaignsService) {}

  @Get('campaigns')
  list(@Req() request: AuthenticatedRequest) {
    return this.campaigns.list(requireAccount(request).id);
  }

  @Post('campaigns')
  create(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    const account = requireAccount(request);
    return this.campaigns.create(account.id, account.nickname, body.name, body.mode);
  }

  @Get('campaigns/:id')
  get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.campaigns.get(requireAccount(request).id, id);
  }

  @Post('campaigns/:id/invites')
  invite(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.campaigns.createInvite(requireAccount(request).id, id, body.expiresInSeconds, body.maxUses);
  }

  @Delete('campaigns/:id/invites/:inviteId')
  revokeInvite(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Param('inviteId') inviteId: string) {
    return this.campaigns.revokeInvite(requireAccount(request).id, id, inviteId);
  }

  @Post('campaign-invites/:token/accept')
  acceptInvite(@Req() request: AuthenticatedRequest, @Param('token') token: string) {
    return this.campaigns.acceptInvite(requireAccount(request).id, token);
  }

  @Post('campaigns/import')
  importLocal(@Req() request: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    const account = requireAccount(request);
    return this.campaigns.importLocal(
      account.id,
      account.nickname,
      body.name,
      body.mode,
      body.save,
      body.idempotencyKey,
      body.sourceProfileId,
      body.legacyResourceCharacter,
    );
  }
}
