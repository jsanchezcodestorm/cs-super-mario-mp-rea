import { Global, Module } from '@nestjs/common';
import { prismaProvider, PrismaService } from './prisma.service.ts';

@Global()
@Module({ providers: [prismaProvider], exports: [PrismaService] })
export class PrismaModule {}
