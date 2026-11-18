import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from './request-context.ts';
import { PrismaService } from '../database/prisma.service.ts';

@Injectable()
export class GameProfileGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const identity = request.identity;
    if (!identity) throw new ForbiddenException('Identità Platform Auth non verificata.');
    const profile = await this.database.account.findUnique({
      where: { id: identity.id },
      select: { id: true, nickname: true },
    });
    if (!profile) throw new ForbiddenException('Scegli un nickname per completare il profilo di gioco.');
    request.account = { ...profile, email: identity.email };
    return true;
  }
}
