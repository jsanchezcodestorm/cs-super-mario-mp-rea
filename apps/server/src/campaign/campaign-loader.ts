import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CampaignDefinition } from '@smw/core';

export async function loadCampaignDefinition(generatedDirectory: string): Promise<CampaignDefinition> {
  const campaign = JSON.parse(await readFile(resolve(generatedDirectory, 'content.json'), 'utf8')) as CampaignDefinition;
  const [overworldNodes, movieTicks] = await Promise.all([
    readFile(resolve(generatedDirectory, 'world/nodes.json'), 'utf8'),
    readFile(resolve(generatedDirectory, 'movies/durations.json'), 'utf8'),
  ]);

  campaign.overworldNodes = JSON.parse(overworldNodes);
  campaign.movieTicks = JSON.parse(movieTicks);
  if (!campaign.levels?.[campaign.start])
    throw Error('Catalogo della ROM incompleto: eseguire npm run extract.');
  return campaign;
}
