import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { SERVER_CONFIGURATION, type ServerConfiguration } from './server-configuration.ts';

@Global()
@Module({})
export class ConfigurationModule {
  static register(configuration: ServerConfiguration): DynamicModule {
    return {
      global: true,
      module: ConfigurationModule,
      providers: [{ provide: SERVER_CONFIGURATION, useValue: configuration }],
      exports: [SERVER_CONFIGURATION],
    };
  }
}
