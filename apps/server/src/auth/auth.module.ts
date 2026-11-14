import { Global, Module } from '@nestjs/common';
import { SERVER_CONFIGURATION } from '../config/server-configuration.ts';
import { PrismaModule } from '../database/prisma.module.ts';
import { PrismaService } from '../database/prisma.service.ts';
import { RateLimitService } from '../security/rate-limit.service.ts';
import { SameOriginGuard, sameOriginGuardProvider } from '../security/same-origin.guard.ts';
import { AuthController } from './auth.controller.ts';
import { AuthService } from './auth.service.ts';
import { EmailDeliveryService } from './email-delivery.service.ts';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    { provide: EmailDeliveryService, useFactory: (configuration) => new EmailDeliveryService(configuration), inject: [SERVER_CONFIGURATION] },
    {
      provide: AuthService,
      useFactory: (database, email, limits, configuration) => new AuthService(database, email, limits, configuration),
      inject: [PrismaService, EmailDeliveryService, RateLimitService, SERVER_CONFIGURATION],
    },
    RateLimitService,
    sameOriginGuardProvider,
  ],
  exports: [AuthService, EmailDeliveryService, RateLimitService, SameOriginGuard],
})
export class AuthModule {}
