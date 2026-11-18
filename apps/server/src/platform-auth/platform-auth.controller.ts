import { Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PlatformAuthClient } from './platform-auth.client.ts';
import { SameOriginGuard } from '../security/same-origin.guard.ts';

@Controller()
export class PlatformAuthController {
  constructor(@Inject(PlatformAuthClient) private readonly auth: PlatformAuthClient) {}

  @Get('/api/session')
  async session(@Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store');
    const user = await this.auth.resolveIdentity(request);
    return { user };
  }

  @Get('/api/auth/csrf')
  csrf(@Req() request: IncomingMessage, @Res() response: ServerResponse) {
    return this.auth.proxyPublicRequest('csrf', request, response);
  }

  @Get('/api/auth/oidc/entra-id/start')
  startMicrosoftLogin(@Req() request: IncomingMessage, @Res() response: ServerResponse) {
    return this.auth.proxyPublicRequest('oidc/entra-id/start', request, response);
  }

  @Post('/api/auth/logout')
  @UseGuards(SameOriginGuard)
  logout(@Req() request: IncomingMessage, @Res() response: ServerResponse) {
    return this.auth.proxyPublicRequest('logout', request, response);
  }
}
