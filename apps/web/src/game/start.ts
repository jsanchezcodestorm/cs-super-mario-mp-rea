import Phaser from 'phaser';
import { WorldScene } from './world-scene';
import type { Content } from './content';
import type { Playback } from './playback';

export function startRenderer(
  content: Content,
  playback: Playback,
  regions: Record<string, { region: number; x: number; y: number }>,
) {
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
    scene: new WorldScene(content, playback, regions),
  });
  return () => game.destroy(true);
}
