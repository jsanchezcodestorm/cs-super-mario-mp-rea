import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter } from '@nestjs/platform-node';
import type { NestNodeApplication } from '@nestjs/platform-node';
import { AppModule } from './app.module.ts';
import { loadServerConfiguration, type ServerConfiguration } from './config/server-configuration.ts';
import { StaticContentHandler } from './http/static-content.ts';
import { GameWebSocketAdapter } from './websocket/game-ws-adapter.ts';
import { GameSocketIdentityService } from './websocket/game-socket-identity.service.ts';
import { SocketIdentityRegistry } from './websocket/socket-identity.registry.ts';

export async function createServerApplication(
  overrides: Partial<ServerConfiguration> = {},
): Promise<NestNodeApplication> {
  const configuration = { ...loadServerConfiguration(), ...overrides };
  const app = await NestFactory.create<NestNodeApplication>(AppModule.register(configuration), new NodeAdapter());
  app.useWebSocketAdapter(new GameWebSocketAdapter(
    app,
    configuration,
    app.get(GameSocketIdentityService),
    app.get(SocketIdentityRegistry),
  ));
  const staticContent = app.get(StaticContentHandler);
  app.use(staticContent.handle.bind(staticContent));
  return app;
}
