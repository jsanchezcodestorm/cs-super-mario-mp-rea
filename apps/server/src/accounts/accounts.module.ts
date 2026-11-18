import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.ts';
import { SecurityModule } from '../security/security.module.ts';
import { AccountsController } from './accounts.controller.ts';
import { AccountsService } from './accounts.service.ts';

@Module({
  imports: [PrismaModule, SecurityModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
