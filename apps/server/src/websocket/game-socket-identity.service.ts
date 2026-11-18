import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { AccountsService } from '../accounts/accounts.service.ts';
import { PlatformAuthClient } from '../platform-auth/platform-auth.client.ts';

@Injectable()
export class GameSocketIdentityService {
  constructor(
    @Inject(PlatformAuthClient) private readonly auth: PlatformAuthClient,
    @Inject(AccountsService) private readonly accounts: AccountsService,
  ) {}

  async resolve(request: Pick<IncomingMessage, 'headers'>) {
    const identity = await this.auth.resolveIdentity(request);
    return identity ? this.accounts.profileForIdentity(identity.id, identity.email) : null;
  }
}

export async function requireGameSocketIdentity(
  resolver: GameSocketIdentityService,
  request: Pick<IncomingMessage, 'headers'>,
) {
  const account = await resolver.resolve(request);
  if (!account) throw new UnauthorizedException('Authentication required.');
  return account;
}
