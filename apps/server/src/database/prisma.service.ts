import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';
import { SERVER_CONFIGURATION, type ServerConfiguration } from '../config/server-configuration.ts';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configuration: ServerConfiguration) {
    if (!configuration.databaseUrl) throw new Error('DATABASE_URL è obbligatoria per avviare il server.');
    const adapter = new PrismaPg({ connectionString: configuration.databaseUrl });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    const now = new Date();
    await this.$transaction([
      this.emailChallenge.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.gameSession.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'INTERRUPTED', closeReason: 'SERVER_RESTART', closedAt: now },
      }),
    ]);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export const prismaProvider = {
  provide: PrismaService,
  useFactory: (configuration: ServerConfiguration) => new PrismaService(configuration),
  inject: [SERVER_CONFIGURATION],
};
