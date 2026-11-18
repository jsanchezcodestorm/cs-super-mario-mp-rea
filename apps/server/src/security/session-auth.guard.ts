import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedRequest } from './request-context.ts';
import { PlatformAuthClient } from '../platform-auth/platform-auth.client.ts';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(PlatformAuthClient) private readonly auth: PlatformAuthClient) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const identity = await this.auth.resolveIdentity(request);
    if (!identity) throw new UnauthorizedException('Accedi con Microsoft per continuare.');
    request.identity = identity;
    return true;
  }
}
