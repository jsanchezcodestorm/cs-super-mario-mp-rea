import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.ts';
import { nicknameKeyOf, normalizeNickname } from './nickname.ts';

@Injectable()
export class AccountsService {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async profileForIdentity(identityId: string, email: string) {
    const profile = await this.database.account.findUnique({
      where: { id: identityId },
      select: { id: true, nickname: true },
    });
    return profile ? { ...profile, email } : null;
  }

  async saveNickname(identityId: string, email: string, value: unknown) {
    const nickname = normalizeNickname(value);
    try {
      const profile = await this.database.account.upsert({
        where: { id: identityId },
        update: { nickname, nicknameKey: nicknameKeyOf(nickname) },
        create: { id: identityId, nickname, nicknameKey: nicknameKeyOf(nickname) },
        select: { id: true, nickname: true },
      });
      return { ...profile, email };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Il nickname è già in uso.');
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}
