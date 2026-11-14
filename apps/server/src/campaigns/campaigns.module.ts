import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { CampaignModule } from '../campaign/campaign.module.ts';
import { PrismaModule } from '../database/prisma.module.ts';
import { campaignsServiceProvider } from './campaigns.service.ts';
import { CampaignsController } from './campaigns.controller.ts';
import { CampaignsService } from './campaigns.service.ts';

@Module({
  imports: [AuthModule, CampaignModule, PrismaModule],
  controllers: [CampaignsController],
  providers: [campaignsServiceProvider],
  exports: [CampaignsService],
})
export class CampaignsModule {}
