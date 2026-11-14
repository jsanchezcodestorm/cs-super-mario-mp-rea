import { Module } from '@nestjs/common';
import { MultiplayerModule } from '../multiplayer/multiplayer.module.ts';
import { GameRuntimeService } from './game-runtime.service.ts';

@Module({ imports: [MultiplayerModule], providers: [GameRuntimeService], exports: [GameRuntimeService] })
export class RuntimeModule {}
