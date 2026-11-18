import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_CONFIGURATION = Symbol('SERVER_CONFIGURATION');
export const CAMPAIGN_DEFINITION = Symbol('CAMPAIGN_DEFINITION');
export const CAMPAIGN_CONTENT_VERSION = Symbol('CAMPAIGN_CONTENT_VERSION');

const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export interface ServerConfiguration {
  host: string;
  port: number;
  webOrigin: string;
  databaseUrl?: string;
  publicAppUrl?: string;
  platformAuthServiceUrl: string;
  platformAuthProductCode: string;
  authSessionCookieName: string;
  authOidcFlowCookieName: string;
  generatedDirectory: string;
  webDistributionDirectory: string;
}

export function loadServerConfiguration(environment: NodeJS.ProcessEnv = process.env): ServerConfiguration {
  const platformAuthServiceUrl = required(environment.PLATFORM_AUTH_SERVICE_URL, 'PLATFORM_AUTH_SERVICE_URL');
  const authUrl = new URL(platformAuthServiceUrl);
  if (!['http:', 'https:'].includes(authUrl.protocol) || authUrl.username || authUrl.password || authUrl.search || authUrl.hash)
    throw new Error('PLATFORM_AUTH_SERVICE_URL deve essere un URL HTTP(S) senza credenziali, query o fragment.');
  const webOrigin = required(environment.WEB_ORIGIN, 'WEB_ORIGIN');
  const webUrl = new URL(webOrigin);
  if (!['http:', 'https:'].includes(webUrl.protocol) || webUrl.origin !== webOrigin || webUrl.username || webUrl.password)
    throw new Error('WEB_ORIGIN deve contenere solo l’origine HTTP(S) dell’applicazione.');
  return {
    host: environment.HOST ?? '127.0.0.1',
    port: Number(environment.PORT ?? 8787),
    webOrigin,
    databaseUrl: environment.DATABASE_URL,
    publicAppUrl: environment.PUBLIC_APP_URL,
    platformAuthServiceUrl,
    platformAuthProductCode: required(environment.PLATFORM_AUTH_PRODUCT_CODE, 'PLATFORM_AUTH_PRODUCT_CODE'),
    authSessionCookieName: environment.SESSION_COOKIE_NAME?.trim() || 'session',
    authOidcFlowCookieName: environment.OIDC_FLOW_COOKIE_NAME?.trim() || 'oidc_flow',
    generatedDirectory: resolve(projectRoot, 'generated'),
    webDistributionDirectory: resolve(projectRoot, 'apps/web/dist'),
  };
}

function required(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} è obbligatoria.`);
  return normalized;
}
