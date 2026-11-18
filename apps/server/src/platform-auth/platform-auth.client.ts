import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  Inject,
} from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { SERVER_CONFIGURATION, type ServerConfiguration } from '../config/server-configuration.ts';

export type PlatformIdentity = { id: string; email: string };
type PublicAuthPath = 'csrf' | 'logout' | 'oidc/entra-id/start';

@Injectable()
export class PlatformAuthClient {
  constructor(@Inject(SERVER_CONFIGURATION) private readonly configuration: ServerConfiguration) {}

  async resolveIdentity(request: Pick<IncomingMessage, 'headers'>): Promise<PlatformIdentity | null> {
    const token = readCookie(request.headers.cookie, this.configuration.authSessionCookieName);
    if (!token) return null;

    let response: Response;
    try {
      response = await fetch(this.authUrl('session'), {
        headers: { cookie: `${this.configuration.authSessionCookieName}=${token}`, accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ServiceUnavailableException('Platform Auth non raggiungibile.');
    }
    if (response.status === 401) return null;
    if (!response.ok) throw new ServiceUnavailableException('Platform Auth non ha verificato la sessione.');

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BadGatewayException('Risposta sessione Platform Auth non valida.');
    }
    const payloadRecord = record(payload) ? payload : null;
    const user = payloadRecord && record(payloadRecord.user) ? payloadRecord.user : null;
    if (!user || typeof user.id !== 'string' || !isUuid(user.id) || typeof user.email !== 'string' ||
        !user.email.trim() || !Array.isArray(user.memberships)) {
      throw new BadGatewayException('Identità Platform Auth non valida.');
    }
    const hasActiveMembership = user.memberships.some((membership: unknown) =>
      record(membership) && membership.productCode === this.configuration.platformAuthProductCode &&
      (membership.status === undefined || membership.status === 'active'));
    if (!hasActiveMembership) throw new ForbiddenException('Membership Super Mario MP non attiva in Platform Auth.');
    return { id: user.id, email: user.email };
  }

  async proxyPublicRequest(path: PublicAuthPath, request: IncomingMessage, response: ServerResponse) {
    const method = path === 'logout' ? 'POST' : 'GET';
    if (request.method !== method) {
      response.statusCode = 405;
      response.setHeader('Allow', method);
      response.end('Method not allowed');
      return;
    }

    const query = new URLSearchParams();
    if (path === 'oidc/entra-id/start') {
      const incoming = new URL(request.url ?? '/', this.configuration.webOrigin);
      const returnToValue = incoming.searchParams.get('returnTo');
      if (!returnToValue) {
        response.statusCode = 400;
        response.end('returnTo is required');
        return;
      }
      let returnTo: URL;
      try {
        returnTo = new URL(returnToValue);
      } catch {
        response.statusCode = 400;
        response.end('returnTo must be an absolute application URL');
        return;
      }
      if (returnTo.origin !== this.configuration.webOrigin || returnTo.username || returnTo.password ||
          returnTo.pathname === '/api' || returnTo.pathname.startsWith('/api/')) {
        response.statusCode = 400;
        response.end('returnTo must stay inside this application');
        return;
      }
      query.set('productCode', this.configuration.platformAuthProductCode);
      query.set('returnTo', returnTo.toString());
    }

    const target = this.authUrl(path);
    target.search = query.toString();
    const headers = new Headers();
    const cookie = authCookieHeader(request, this.configuration);
    if (cookie) headers.set('cookie', cookie);
    for (const name of ['origin', 'referer', 'user-agent', 'x-csrf-token', 'content-type', 'accept']) {
      const value = request.headers[name];
      if (typeof value === 'string') headers.set(name, value);
    }
    headers.set('x-forwarded-proto', new URL(this.configuration.webOrigin).protocol.slice(0, -1));

    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method,
        headers,
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new ServiceUnavailableException('Platform Auth non raggiungibile.');
    }

    response.statusCode = upstream.status;
    response.setHeader('Cache-Control', 'no-store');
    for (const name of ['content-type', 'location']) {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    }
    const upstreamHeaders = upstream.headers as Headers & { getSetCookie(): string[] };
    const cookies = upstreamHeaders.getSetCookie();
    if (cookies.length) response.setHeader('Set-Cookie', cookies);
    response.end(Buffer.from(await upstream.arrayBuffer()));
  }

  private authUrl(path: string) {
    const url = new URL(this.configuration.platformAuthServiceUrl);
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/auth/${path}`;
    return url;
  }
}

function readCookie(header: string | string[] | undefined, name: string): string | null {
  const values = new Map<string, string[]>();
  for (const item of (Array.isArray(header) ? header.join(';') : header ?? '').split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) values.set(key, [...(values.get(key) ?? []), value]);
  }
  const matches = values.get(name);
  if (!matches || matches.length !== 1 || !/^[A-Za-z0-9._~-]{16,8192}$/.test(matches[0])) return null;
  return matches[0];
}

function authCookieHeader(request: IncomingMessage, configuration: ServerConfiguration) {
  const allowed = new Set([configuration.authSessionCookieName, configuration.authOidcFlowCookieName, 'csrf']);
  const values = new Map<string, string[]>();
  const header = request.headers.cookie;
  for (const item of (Array.isArray(header) ? header.join(';') : header ?? '').split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (allowed.has(name) && /^[A-Za-z0-9._~-]{1,8192}$/.test(value))
      values.set(name, [...(values.get(name) ?? []), value]);
  }
  return [...values.entries()]
    .filter(([, entries]) => entries.length === 1)
    .map(([name, entries]) => `${name}=${entries[0]}`)
    .join('; ');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
