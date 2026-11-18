import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerConfiguration } from '../apps/server/src/config/server-configuration.ts';
import { AccountsService } from '../apps/server/src/accounts/accounts.service.ts';
import type { PrismaService } from '../apps/server/src/database/prisma.service.ts';
import { PlatformAuthClient } from '../apps/server/src/platform-auth/platform-auth.client.ts';
import { SessionAuthGuard } from '../apps/server/src/security/session-auth.guard.ts';
import { GameProfileGuard } from '../apps/server/src/security/game-profile.guard.ts';
import { GameSocketIdentityService, requireGameSocketIdentity } from '../apps/server/src/websocket/game-socket-identity.service.ts';

const identityId = '86a2b99d-cda3-4a85-89b2-20a378f0f7fb';
const sessionCookie = 'eyJhbGciOiJSUzI1NiJ9.session-token-value';
const config: ServerConfiguration = {
  host: '127.0.0.1',
  port: 8787,
  webOrigin: 'https://super-mario-mp.cs.lvh.me:8080',
  publicAppUrl: 'https://super-mario-mp.cs.lvh.me:8080',
  databaseUrl: 'postgresql://smw:smw@127.0.0.1:5442/smw',
  platformAuthServiceUrl: 'http://127.0.0.1:3100',
  platformAuthProductCode: 'super-mario-mp',
  authSessionCookieName: 'session',
  authOidcFlowCookieName: 'oidc_flow',
  generatedDirectory: '/tmp/generated',
  webDistributionDirectory: '/tmp/dist',
};

function request(cookie?: string, url = '/') {
  return {
    method: 'GET',
    url,
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: config.webOrigin,
    },
  } as unknown as IncomingMessage;
}

function sessionResponse(memberships: unknown[] = [{ productCode: config.platformAuthProductCode }]) {
  return new Response(JSON.stringify({
    user: { id: identityId, email: 'mario@example.test', memberships },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function withFetch<T>(fetcher: typeof fetch, run: () => Promise<T>) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('Platform Auth session resolver requires an active Super Mario MP membership', async () => {
  const client = new PlatformAuthClient(config);
  const identity = await withFetch(async () => sessionResponse(), () => client.resolveIdentity(request('session=' + sessionCookie)));
  assert.deepEqual(identity, { id: identityId, email: 'mario@example.test' });

  await withFetch(async () => sessionResponse([{ productCode: 'other-product' }]), async () => {
    await assert.rejects(() => client.resolveIdentity(request('session=' + sessionCookie)), ForbiddenException);
  });
  await withFetch(async () => sessionResponse([{ productCode: config.platformAuthProductCode, status: 'disabled' }]), async () => {
    await assert.rejects(() => client.resolveIdentity(request('session=' + sessionCookie)), ForbiddenException);
  });
});

test('missing sessions are anonymous and Auth outages fail closed', async () => {
  const client = new PlatformAuthClient(config);
  let calls = 0;
  const anonymous = await withFetch(async () => { calls++; return sessionResponse(); }, () => client.resolveIdentity(request()));
  assert.equal(anonymous, null);
  assert.equal(calls, 0);

  await withFetch(async () => { throw new Error('connection refused'); }, async () => {
    await assert.rejects(() => client.resolveIdentity(request('session=' + sessionCookie)), ServiceUnavailableException);
  });
});

test('Microsoft OIDC start carries the product and rejects off-origin returns', async () => {
  const client = new PlatformAuthClient(config);
  const output: { statusCode: number; body?: string; headers: Map<string, string | string[]> } = {
    statusCode: 0,
    headers: new Map(),
  };
  const response = {
    get statusCode() { return output.statusCode; },
    set statusCode(value: number) { output.statusCode = value; },
    setHeader(name: string, value: string | string[]) { output.headers.set(name.toLowerCase(), value); return this; },
    end(body?: string) { output.body = body; return this; },
  } as unknown as ServerResponse;
  let target = '';
  await withFetch(async (input) => {
    target = String(input);
    return new Response(null, { status: 302, headers: { location: 'https://login.microsoftonline.test/' } });
  }, () => client.proxyPublicRequest(
    'oidc/entra-id/start',
    request(undefined, '/api/auth/oidc/entra-id/start?returnTo=' + encodeURIComponent(config.webOrigin + '/')),
    response,
  ));
  const loginTarget = new URL(target);
  assert.equal(loginTarget.pathname, '/auth/oidc/entra-id/start');
  assert.equal(loginTarget.searchParams.get('productCode'), config.platformAuthProductCode);
  assert.equal(loginTarget.searchParams.get('returnTo'), config.webOrigin + '/');
  assert.equal(output.statusCode, 302);
  assert.equal(output.headers.get('location'), 'https://login.microsoftonline.test/');

  await withFetch(async () => { throw new Error('must not be called'); }, () => client.proxyPublicRequest(
    'oidc/entra-id/start',
    request(undefined, '/api/auth/oidc/entra-id/start?returnTo=' + encodeURIComponent('https://evil.example/')),
    response,
  ));
  assert.equal(output.statusCode, 400);
  assert.match(output.body ?? '', /returnTo must stay inside/);
});

test('logout forwards the CSRF token and only the cookies required by Platform Auth', async () => {
  const client = new PlatformAuthClient(config);
  const output: { statusCode: number; headers: Map<string, string | string[]>; body?: Buffer } = {
    statusCode: 0,
    headers: new Map(),
  };
  const response = {
    get statusCode() { return output.statusCode; },
    set statusCode(value: number) { output.statusCode = value; },
    setHeader(name: string, value: string | string[]) { output.headers.set(name.toLowerCase(), value); return this; },
    end(body?: Buffer) { output.body = body; return this; },
  } as unknown as ServerResponse;
  let target = '';
  let forwarded: Headers | undefined;
  await withFetch(async (input, init) => {
    target = String(input);
    forwarded = new Headers(init?.headers);
    return new Response('{"ok":true}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'session=cleared; Path=/; HttpOnly',
      },
    });
  }, () => client.proxyPublicRequest('logout', {
    ...request('session=' + sessionCookie + '; csrf=csrf-token-value; unrelated=do-not-forward'),
    method: 'POST',
    headers: {
      cookie: 'session=' + sessionCookie + '; csrf=csrf-token-value; unrelated=do-not-forward',
      origin: config.webOrigin,
      'x-csrf-token': 'csrf-token-value',
    },
  } as unknown as IncomingMessage, response));

  assert.equal(target, 'http://127.0.0.1:3100/auth/logout');
  assert.equal(forwarded?.get('cookie'), 'session=' + sessionCookie + '; csrf=csrf-token-value');
  assert.equal(forwarded?.get('x-csrf-token'), 'csrf-token-value');
  assert.equal(output.statusCode, 200);
  assert.match(String(output.headers.get('set-cookie')), /session=cleared/);
});

test('REST and WebSocket guards reject missing sessions and profiles', async () => {
  const auth = new PlatformAuthClient(config);
  const context = {
    switchToHttp: () => ({ getRequest: () => request() }),
  } as unknown as ExecutionContext;
  await assert.rejects(() => new SessionAuthGuard(auth).canActivate(context), UnauthorizedException);

  const emptyAccounts = { profileForIdentity: async () => null } as unknown as AccountsService;
  const identityContext = {
    switchToHttp: () => ({ getRequest: () => ({ identity: { id: identityId, email: 'mario@example.test' } }) }),
  } as unknown as ExecutionContext;
  const emptyDatabase = {
    account: { findUnique: async () => null },
  } as unknown as PrismaService;
  await assert.rejects(() => new GameProfileGuard(emptyDatabase).canActivate(identityContext), ForbiddenException);

  const sockets = new GameSocketIdentityService(auth, emptyAccounts);
  await assert.rejects(() => requireGameSocketIdentity(sockets, request()), UnauthorizedException);
});

test('first profile write binds nickname to the Platform Auth identity', async () => {
  const rows = new Map<string, { id: string; nickname: string; nicknameKey: string }>();
  const database = {
    account: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      upsert: async ({ where, create, update }: {
        where: { id: string };
        create: { id: string; nickname: string; nicknameKey: string };
        update: { nickname: string; nicknameKey: string };
      }) => {
        const existing = rows.get(where.id);
        const row = existing ? { ...existing, ...update } : create;
        rows.set(where.id, row);
        return { id: row.id, nickname: row.nickname };
      },
    },
  };
  const accounts = new AccountsService(database as never);
  assert.equal(await accounts.profileForIdentity(identityId, 'mario@example.test'), null);
  const profile = await accounts.saveNickname(identityId, 'mario@example.test', '  Mario  ');
  assert.deepEqual(profile, { id: identityId, email: 'mario@example.test', nickname: 'Mario' });
  assert.deepEqual(rows.get(identityId), { id: identityId, nickname: 'Mario', nicknameKey: 'mario' });
});
