import { Module } from '@nestjs/common';
import { CampaignModule } from '../campaign/campaign.module.ts';
import { PrismaModule } from '../database/prisma.module.ts';
import { SecurityModule } from '../security/security.module.ts';
import { campaignsServiceProvider } from './campaigns.service.ts';
import { CampaignsController } from './campaigns.controller.ts';
import { CampaignsService } from './campaigns.service.ts';

@Module({
  imports: [CampaignModule, PrismaModule, SecurityModule],
  controllers: [CampaignsController],
  providers: [campaignsServiceProvider],
  exports: [CampaignsService],
})
export class CampaignsModule {}
