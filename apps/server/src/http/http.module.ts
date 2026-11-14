import { Module } from '@nestjs/common';
import { SERVER_CONFIGURATION, type ServerConfiguration } from '../config/server-configuration.ts';
import { HealthController } from './health.controller.ts';
import { StaticContentHandler } from './static-content.ts';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: StaticContentHandler,
      useFactory: (configuration: ServerConfiguration) =>
        new StaticContentHandler(configuration.webDistributionDirectory, configuration.generatedDirectory),
      inject: [SERVER_CONFIGURATION],
    },
  ],
  exports: [StaticContentHandler],
})
export class HttpModule {}
