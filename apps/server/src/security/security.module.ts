import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { SessionAuthGuard, sessionAuthGuardProvider } from './session-auth.guard.ts';

@Global()
@Module({
  imports: [AuthModule],
  providers: [sessionAuthGuardProvider],
  exports: [SessionAuthGuard],
})
export class SecurityModule {}
