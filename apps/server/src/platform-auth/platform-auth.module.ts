import { Global, Module } from '@nestjs/common';
import { SameOriginGuard } from '../security/same-origin.guard.ts';
import { PlatformAuthClient } from './platform-auth.client.ts';
import { PlatformAuthController } from './platform-auth.controller.ts';

@Global()
@Module({
  controllers: [PlatformAuthController],
  providers: [PlatformAuthClient, SameOriginGuard],
  exports: [PlatformAuthClient],
})
export class PlatformAuthModule {}
