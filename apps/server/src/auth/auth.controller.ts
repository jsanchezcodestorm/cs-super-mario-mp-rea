import { Body, Controller, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SERVER_CONFIGURATION, type ServerConfiguration } from '../config/server-configuration.ts';
import { SameOriginGuard } from '../security/same-origin.guard.ts';
import { clientAddress, readCookie } from '../security/request-context.ts';
import { AuthService } from './auth.service.ts';

@Controller('/api/v1/auth')
@UseGuards(SameOriginGuard)
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SERVER_CONFIGURATION)
    private readonly configuration: ServerConfiguration,
  ) {}

  @Post('register')
  register(@Body() body: Record<string, unknown>, @Req() request: IncomingMessage) {
    return this.auth.register(body.email, body.nickname, body.password, clientAddress(request));
  }

  @Post('login')
  async login(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) response: ServerResponse,
    @Req() request: IncomingMessage,
  ) {
    const result = await this.auth.login(body.email, body.password, clientAddress(request));
    response.setHeader('Set-Cookie', sessionCookie(this.configuration, result.token, this.configuration.authSessionTtlSeconds));
    return { account: { id: result.account.id, nickname: result.account.nickname } };
  }

  @Post('password-reset-request')
  requestPasswordReset(@Body() body: Record<string, unknown>, @Req() request: IncomingMessage) {
    return this.auth.requestPasswordReset(body.email, clientAddress(request));
  }

  @Post('password-reset')
  resetPassword(@Body() body: Record<string, unknown>, @Req() request: IncomingMessage) {
    return this.auth.resetPassword(body.token, body.password, clientAddress(request));
  }

  @Post('verify-link')
  async verifyLink(
    @Body() body: Record<string, unknown>,
    @Res({ passthrough: true }) response: ServerResponse,
    @Req() request: IncomingMessage,
  ) {
    const result = await this.auth.verifyLink(body.token, clientAddress(request));
    response.setHeader('Set-Cookie', sessionCookie(this.configuration, result.token, this.configuration.authSessionTtlSeconds));
    return { account: { id: result.account.id, nickname: result.account.nickname } };
  }

  @Post('logout')
  async logout(@Req() request: IncomingMessage, @Res({ passthrough: true }) response: ServerResponse) {
    const token = readCookie(request, this.configuration.authCookieName);
    if (token) await this.auth.logout(token);
    response.setHeader('Set-Cookie', sessionCookie(this.configuration, '', 0));
    return { ok: true };
  }
}

export function sessionCookie(configuration: ServerConfiguration, token: string, maxAge: number) {
  const parts = [
    `${configuration.authCookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  return parts.join('; ');
}
