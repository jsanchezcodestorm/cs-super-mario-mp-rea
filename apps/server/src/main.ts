import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { CampaignDefinition } from '@smw/core';
import { createGateway } from './gateway.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const generated = resolve(root, 'generated');
const campaign = JSON.parse(await readFile(resolve(generated, 'content.json'), 'utf8')) as CampaignDefinition;
campaign.movieTicks = JSON.parse(await readFile(resolve(generated, 'movies/durations.json'), 'utf8'));
if (!campaign.levels?.[campaign.start])
  throw Error('Catalogo della ROM incompleto: eseguire npm run extract.');
const gateway = createGateway(campaign, resolve(root, 'apps/web/dist'), generated, process.env.WEB_ORIGIN);
const port = Number(process.env.PORT ?? 8787),
  host = process.env.HOST ?? '127.0.0.1';
gateway.server.listen(port, host, () => console.log(`Super Mario World co-op · http://${host}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void gateway.stop());
