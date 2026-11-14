import type { IncomingMessage } from 'node:http';

export type AuthenticatedAccount = { id: string; email: string; nickname: string };
export type AuthenticatedRequest = IncomingMessage & { account?: AuthenticatedAccount };

export function clientAddress(request: IncomingMessage) {
  return request.socket.remoteAddress ?? 'unknown';
}

export function readCookie(request: IncomingMessage, name: string) {
  const header = request.headers.cookie;
  if (!header) return null;
  const matches = header.split(';').map((part) => part.trim()).filter((part) => part.startsWith(name + '='));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : null;
}

export function requireAccount(request: AuthenticatedRequest) {
  if (!request.account) throw new Error('Sessione autenticata assente.');
  return request.account;
}
