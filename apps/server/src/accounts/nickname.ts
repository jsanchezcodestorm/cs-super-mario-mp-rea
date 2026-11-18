import { BadRequestException } from '@nestjs/common';

export function normalizeNickname(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestException('Nickname non valido.');
  const nickname = value.normalize('NFKC').trim();
  const length = Array.from(nickname).length;
  if (length < 1 || length > 24 || /[\p{Cc}\p{Cf}]/u.test(nickname))
    throw new BadRequestException('Il nickname deve contenere da 1 a 24 caratteri.');
  return nickname;
}

export function nicknameKeyOf(nickname: string) {
  return nickname.normalize('NFKC').toLowerCase();
}
