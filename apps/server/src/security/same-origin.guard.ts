import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { SERVER_CONFIGURATION, type ServerConfiguration } from '../config/server-configuration.ts';
import type { IncomingMessage } from 'node:http';

@Injectable()
export class SameOriginGuard implements CanActivate {
  constructor(@Inject(SERVER_CONFIGURATION) private readonly configuration: ServerConfiguration) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<IncomingMessage>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method ?? 'GET')) return true;
    const header = request.headers.origin;
    const origin = Array.isArray(header) ? header[0] : header;
    if (!origin) throw new ForbiddenException('Origine della richiesta non valida.');
    if (origin === this.configuration.webOrigin) return true;
    try {
      if (new URL(origin).host === request.headers.host) return true;
    } catch {
      // The request is rejected below when Origin cannot be parsed.
    }
    throw new ForbiddenException('Origine della richiesta non valida.');
  }
}

export const sameOriginGuardProvider = {
  provide: SameOriginGuard,
  useFactory: (configuration: ServerConfiguration) => new SameOriginGuard(configuration),
  inject: [SERVER_CONFIGURATION],
};
