import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.ts';
import { AuthModule } from '../auth/auth.module.ts';
import { AccountsController } from './accounts.controller.ts';
import { AccountsService } from './accounts.service.ts';

@Module({ imports: [AuthModule, PrismaModule], controllers: [AccountsController], providers: [AccountsService] })
export class AccountsModule {}
