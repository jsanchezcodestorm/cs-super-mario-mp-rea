import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.ts';
import type { ServerConfiguration } from '../config/server-configuration.ts';
import { RateLimitService } from '../security/rate-limit.service.ts';
import { hashPassword, validatePassword, verifyPassword } from '../security/password-hasher.ts';
import { EmailDeliveryService } from './email-delivery.service.ts';

const challengeLifetimeMs = 15 * 60_000;
const accountDomain = 'codestorm.it';

export type PublicAccount = { id: string; nickname: string; email: string };
export type CreatedSession = { token: string; account: PublicAccount; expiresAt: Date };

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly dummyPasswordHash = hashPassword(randomBytes(32).toString('base64url'));

  constructor(
    private readonly database: PrismaService,
    private readonly emailDelivery: EmailDeliveryService,
    private readonly limits: RateLimitService,
    private readonly configuration: ServerConfiguration,
  ) {}

  async onModuleInit() {
    await this.dummyPasswordHash;
  }

  async register(emailValue: unknown, nicknameValue: unknown, passwordValue: unknown, ip: string) {
    const email = normalizeEmail(emailValue);
    const nickname = normalizeNickname(nicknameValue);
    const password = validatePassword(passwordValue);
    const nicknameKey = nicknameKeyOf(nickname);
    this.limits.consume(`register-ip:${ip}`, 5, 60 * 60_000);
    this.limits.consume(`register-email:${sha256(email)}`, 3, 60 * 60_000);

    const existing = await this.database.account.findFirst({
      where: { OR: [{ email }, { nicknameKey }] },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Email o nickname già in uso.');
    const pending = await this.database.emailChallenge.findFirst({
      where: {
        purpose: 'REGISTER',
        consumedAt: null,
        expiresAt: { gt: new Date() },
        OR: [{ pendingEmail: email }, { pendingNicknameKey: nicknameKey }],
      },
      select: { id: true },
    });
    if (pending) throw new ConflictException('Esiste già una verifica in corso per questi dati.');
    const passwordHash = await hashPassword(password);
    await this.sendChallenge({ purpose: 'REGISTER', email, nickname, nicknameKey, passwordHash });
    return { message: 'Se l’indirizzo è valido, riceverai un link di verifica.' };
  }

  async login(emailValue: unknown, passwordValue: unknown, ip: string): Promise<CreatedSession> {
    const email = normalizeEmail(emailValue);
    const password = validatePassword(passwordValue, 1);
    this.limits.consume(`login-ip:${ip}`, 8, 60 * 60_000);
    this.limits.consume(`login-email:${sha256(email)}`, 5, 60 * 60_000);
    const account = await this.database.account.findUnique({
      where: { email },
      select: { id: true, email: true, nickname: true, passwordHash: true },
    });
    const encoded = account?.passwordHash ?? await this.dummyPasswordHash;
    const valid = await verifyPassword(password, encoded);
    if (!account?.passwordHash || !valid) throw new UnauthorizedException('Email o password non corrette.');
    return this.createSession({ id: account.id, email: account.email, nickname: account.nickname });
  }

  async requestPasswordReset(emailValue: unknown, ip: string) {
    const email = normalizeEmail(emailValue);
    this.limits.consume(`password-reset-ip:${ip}`, 5, 60 * 60_000);
    this.limits.consume(`password-reset-email:${sha256(email)}`, 3, 60 * 60_000);
    const account = await this.database.account.findUnique({ where: { email }, select: { id: true } });
    if (account) await this.sendChallenge({ purpose: 'PASSWORD_RESET', accountId: account.id, email });
    return { message: 'Se l’account esiste, riceverai le istruzioni per reimpostare la password.' };
  }

  async resetPassword(tokenValue: unknown, passwordValue: unknown, ip: string) {
    this.limits.consume(`password-reset-confirm-ip:${ip}`, 12, 60_000);
    const token = challengeToken(tokenValue);
    const password = validatePassword(passwordValue);
    const tokenHash = sha256(token);
    const current = await this.database.emailChallenge.findUnique({
      where: { tokenHash },
      select: { id: true, accountId: true, purpose: true, expiresAt: true, consumedAt: true },
    });
    const now = new Date();
    if (!current || current.purpose !== 'PASSWORD_RESET' || !current.accountId || current.consumedAt || current.expiresAt <= now)
      throw new BadRequestException('Il link non è valido o è scaduto.');

    const passwordHash = await hashPassword(password);
    await this.database.$transaction(async (transaction) => {
      const consumed = await transaction.emailChallenge.updateMany({
        where: { id: current.id, purpose: 'PASSWORD_RESET', consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Il link non è valido o è scaduto.');
      await transaction.account.update({ where: { id: current.accountId! }, data: { passwordHash } });
      await transaction.authSession.updateMany({
        where: { accountId: current.accountId!, revokedAt: null },
        data: { revokedAt: now },
      });
    }, { isolationLevel: 'Serializable' });
    return { ok: true };
  }

  async verifyLink(token: unknown, ip: string): Promise<CreatedSession> {
    this.limits.consume(`verify-ip:${ip}`, 12, 60_000);
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(token))
      throw new BadRequestException('Il link non è valido o è scaduto.');
    const tokenHash = sha256(token);
    const sessionToken = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.configuration.authSessionTtlSeconds * 1000);
    try {
      const account = await this.database.$transaction(async (transaction) => {
        const challenge = await transaction.emailChallenge.findUnique({ where: { tokenHash } });
        if (!challenge || challenge.consumedAt || challenge.expiresAt <= now)
          throw new BadRequestException('Il link non è valido o è scaduto.');
        const consumed = await transaction.emailChallenge.updateMany({
          where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
          data: { consumedAt: now },
        });
        if (consumed.count !== 1) throw new BadRequestException('Il link è già stato utilizzato.');

        let verifiedAccount;
        if (challenge.purpose === 'REGISTER') {
          if (!challenge.pendingEmail || !challenge.pendingNickname || !challenge.pendingNicknameKey)
            throw new BadRequestException('La richiesta di registrazione non è valida.');
          verifiedAccount = await transaction.account.create({
            data: {
              email: challenge.pendingEmail,
              nickname: challenge.pendingNickname,
              nicknameKey: challenge.pendingNicknameKey,
              passwordHash: challenge.pendingPasswordHash,
              emailVerifiedAt: now,
            },
            select: { id: true, email: true, nickname: true },
          });
        } else if (challenge.purpose === 'LOGIN') {
          if (!challenge.accountId) throw new BadRequestException('La richiesta di accesso non è valida.');
          verifiedAccount = await transaction.account.findUnique({
            where: { id: challenge.accountId },
            select: { id: true, email: true, nickname: true },
          });
          if (!verifiedAccount) throw new BadRequestException('L’account non è più disponibile.');
        } else throw new BadRequestException('Il link non è valido o è scaduto.');
        await transaction.authSession.create({
          data: { tokenHash: sha256(sessionToken), accountId: verifiedAccount.id, expiresAt },
        });
        return verifiedAccount;
      }, { isolationLevel: 'Serializable' });
      return { token: sessionToken, account, expiresAt };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Email o nickname già in uso.');
      throw error;
    }
  }

  async accountForSession(token: string): Promise<PublicAccount | null> {
    const session = await this.database.authSession.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        account: { select: { id: true, email: true, nickname: true, emailVerifiedAt: true } },
        expiresAt: true,
        revokedAt: true,
      },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.account.emailVerifiedAt)
      return null;
    return { id: session.account.id, email: session.account.email, nickname: session.account.nickname };
  }

  async logout(token: string) {
    await this.database.authSession.updateMany({
      where: { tokenHash: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(account: PublicAccount): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.configuration.authSessionTtlSeconds * 1000);
    await this.database.authSession.create({
      data: { tokenHash: sha256(token), accountId: account.id, expiresAt },
    });
    return { token, account, expiresAt };
  }

  private async sendChallenge(input: {
    purpose: 'REGISTER' | 'PASSWORD_RESET';
    accountId?: string;
    email: string;
    nickname?: string;
    nicknameKey?: string;
    passwordHash?: string;
  }) {
    if (!this.configuration.publicAppUrl) throw new ServiceUnavailableException('PUBLIC_APP_URL non configurato.');
    const token = randomBytes(32).toString('base64url');
    const challenge = await this.database.emailChallenge.create({
      data: {
        tokenHash: sha256(token),
        purpose: input.purpose,
        accountId: input.accountId,
        pendingEmail: input.purpose === 'REGISTER' ? input.email : null,
        pendingNickname: input.nickname,
        pendingNicknameKey: input.nicknameKey,
        pendingPasswordHash: input.passwordHash,
        expiresAt: new Date(Date.now() + challengeLifetimeMs),
      },
      select: { id: true },
    });
    try {
      const route = input.purpose === 'REGISTER' ? '/verify-email' : '/reset-password';
      const link = new URL(route, this.configuration.publicAppUrl);
      link.searchParams.set('token', token);
      await this.emailDelivery.sendAuthenticationLink(
        input.email,
        link.toString(),
        input.purpose === 'REGISTER' ? 'VERIFY_EMAIL' : 'PASSWORD_RESET',
      );
    } catch (error) {
      await this.database.emailChallenge.delete({ where: { id: challenge.id } });
      throw error;
    }
  }
}

function challengeToken(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(value))
    throw new BadRequestException('Il link non è valido o è scaduto.');
  return value;
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestException('Email non valida.');
  const email = value.trim().normalize('NFKC').toLowerCase();
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[0] || parts[1] !== accountDomain || email.length > 320 || /\s/.test(email))
    throw new BadRequestException(`Sono ammessi solo indirizzi con dominio ${accountDomain}.`);
  return email;
}

export function normalizeNickname(value: unknown) {
  if (typeof value !== 'string') throw new BadRequestException('Nickname non valido.');
  const nickname = value.normalize('NFKC').trim();
  if (Array.from(nickname).length < 1 || Array.from(nickname).length > 24 || /[\p{Cc}\p{Cf}]/u.test(nickname))
    throw new BadRequestException('Il nickname deve contenere da 1 a 24 caratteri.');
  return nickname;
}

export function nicknameKeyOf(nickname: string) {
  return nickname.normalize('NFKC').toLowerCase();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isUniqueViolation(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}
