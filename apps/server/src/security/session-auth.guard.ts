import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { SERVER_CONFIGURATION, type ServerConfiguration } from '../config/server-configuration.ts';
import { AuthService } from '../auth/auth.service.ts';
import { readCookie, type AuthenticatedRequest } from './request-context.ts';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(SERVER_CONFIGURATION)
    private readonly configuration: ServerConfiguration,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request, this.configuration.authCookieName);
    const account = token ? await this.auth.accountForSession(token) : null;
    if (!account) throw new UnauthorizedException('Accedi per continuare.');
    request.account = account;
    return true;
  }
}

export const sessionAuthGuardProvider = {
  provide: SessionAuthGuard,
  useFactory: (auth: AuthService, configuration: ServerConfiguration) => new SessionAuthGuard(auth, configuration),
  inject: [AuthService, SERVER_CONFIGURATION],
};
