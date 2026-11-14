import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.ts';
import { nicknameKeyOf, normalizeNickname } from '../auth/auth.service.ts';

@Injectable()
export class AccountsService {
  constructor(@Inject(PrismaService) private readonly database: PrismaService) {}

  async updateNickname(accountId: string, value: unknown) {
    const nickname = normalizeNickname(value);
    try {
      return await this.database.account.update({
        where: { id: accountId },
        data: { nickname, nicknameKey: nicknameKeyOf(nickname) },
        select: { id: true, email: true, nickname: true, emailVerifiedAt: true, createdAt: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Il nickname è già in uso.');
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}
