import Phaser from 'phaser';
import { WorldScene } from './world-scene';
import { Controls } from './input';
import type { Content } from './content';
import type { GameSession } from './playback';

export function startRenderer(
  content: Content,
  playback: GameSession,
  regions: Record<string, { region: number; x: number; y: number }>,
) {
  const controls = new Controls();
  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    width: 256,
    height: 224,
    parent: 'screen',
    pixelArt: true,
    antialias: false,
    audio: { noAudio: true },
    backgroundColor: '#132c32',
    banner: false,
    fps: { target: 60 },
    scene: new WorldScene(content, playback, regions, controls),
  });
  return () => {
    controls.destroy();
    game.destroy(true);
  };
}
