import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_CONFIGURATION = Symbol('SERVER_CONFIGURATION');
export const CAMPAIGN_DEFINITION = Symbol('CAMPAIGN_DEFINITION');
export const CAMPAIGN_CONTENT_VERSION = Symbol('CAMPAIGN_CONTENT_VERSION');

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export interface ServerConfiguration {
  host: string;
  port: number;
  webOrigin?: string;
  databaseUrl?: string;
  smtpUrl?: string;
  emailFrom?: string;
  publicAppUrl?: string;
  authSessionTtlSeconds: number;
  authCookieName: string;
  generatedDirectory: string;
  webDistributionDirectory: string;
}

export function loadServerConfiguration(environment: NodeJS.ProcessEnv = process.env): ServerConfiguration {
  return {
    host: environment.HOST ?? '127.0.0.1',
    port: Number(environment.PORT ?? 8787),
    webOrigin: environment.WEB_ORIGIN,
    databaseUrl: environment.DATABASE_URL,
    smtpUrl: environment.SMTP_URL,
    emailFrom: environment.EMAIL_FROM,
    publicAppUrl: environment.PUBLIC_APP_URL,
    authSessionTtlSeconds: positiveInteger(environment.AUTH_SESSION_TTL_SECONDS, 2_592_000),
    authCookieName: 'smw_session',
    generatedDirectory: resolve(projectRoot, 'generated'),
    webDistributionDirectory: resolve(projectRoot, 'apps/web/dist'),
  };
}

function positiveInteger(value: string | undefined, defaultValue: number) {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 60 || parsed > 15_552_000)
    throw new Error('AUTH_SESSION_TTL_SECONDS deve essere compreso tra 60 e 15552000.');
  return parsed;
}
