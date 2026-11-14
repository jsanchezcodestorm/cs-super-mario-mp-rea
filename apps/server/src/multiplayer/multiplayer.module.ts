import { Module } from '@nestjs/common';
import { GameSessionsModule } from '../game-sessions/game-sessions.module.ts';
import { GameSessionsService } from '../game-sessions/game-sessions.service.ts';
import { Lobby } from './lobby.ts';

@Module({
  imports: [GameSessionsModule],
  providers: [
    {
      provide: Lobby,
      useFactory: (sessions: GameSessionsService) => new Lobby(sessions),
      inject: [GameSessionsService],
    },
  ],
  exports: [Lobby],
})
export class MultiplayerModule {}
