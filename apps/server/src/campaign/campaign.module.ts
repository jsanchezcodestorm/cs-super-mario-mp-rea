import { Module } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { loadCampaignDefinition } from './campaign-loader.ts';
import {
  CAMPAIGN_CONTENT_VERSION,
  CAMPAIGN_DEFINITION,
  SERVER_CONFIGURATION,
  type ServerConfiguration,
} from '../config/server-configuration.ts';

@Module({
  providers: [
    {
      provide: CAMPAIGN_DEFINITION,
      useFactory: (configuration: ServerConfiguration) =>
        loadCampaignDefinition(configuration.generatedDirectory),
      inject: [SERVER_CONFIGURATION],
    },
    {
      provide: CAMPAIGN_CONTENT_VERSION,
      useFactory: (campaign: Awaited<ReturnType<typeof loadCampaignDefinition>>) =>
        createHash('sha256').update(JSON.stringify(campaign)).digest('hex'),
      inject: [CAMPAIGN_DEFINITION],
    },
  ],
  exports: [CAMPAIGN_DEFINITION, CAMPAIGN_CONTENT_VERSION],
})
export class CampaignModule {}
