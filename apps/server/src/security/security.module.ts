import { Global, Module } from '@nestjs/common';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module.ts';
import { PrismaModule } from '../database/prisma.module.ts';
import { RateLimitService } from './rate-limit.service.ts';
import { GameProfileGuard } from './game-profile.guard.ts';
import { SameOriginGuard } from './same-origin.guard.ts';
import { SessionAuthGuard } from './session-auth.guard.ts';

@Global()
@Module({
  imports: [PlatformAuthModule, PrismaModule],
  providers: [SessionAuthGuard, GameProfileGuard, SameOriginGuard, RateLimitService],
  exports: [SessionAuthGuard, GameProfileGuard, SameOriginGuard, RateLimitService],
})
export class SecurityModule {}
