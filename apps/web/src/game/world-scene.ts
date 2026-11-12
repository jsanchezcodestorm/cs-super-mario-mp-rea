import Phaser from 'phaser';
import { scrollingCamera, type PlayerId } from '@smw/core';
import { preloadMapEvents } from './map-events';
import { CastView } from './cast-view';
import { OverworldView, type WorldNodes } from './overworld-view';
import { preloadBosses, drawBossArena } from './boss-view';
import { Controls } from './input';
import { cameraFor, drawRoom, HEIGHT, WIDTH } from './terrain-view';
import type { Content } from './content';
import type { Playback } from './playback';

export class WorldScene extends Phaser.Scene {
  private terrain!: Phaser.Textures.CanvasTexture;
  private controls?: Controls;
  private cast!: CastView;
  private map!: OverworldView;
  private inputClock = 0;

  constructor(
    private content: Content,
    private live: Playback,
    private nodes: WorldNodes,
  ) {
    super('world');
  }
  preload() {
    this.load.atlas('actors', '/assets/actors.png', '/assets/actors.json');
    this.load.atlas('creatures', '/assets/creatures.png', '/assets/creatures.json');
    preloadMapEvents(this);
    preloadBosses(this);
    for (const key of new Set(Object.values(this.content.levels).map((s) => s.atlas)))
      this.load.image(key, '/assets/' + key);
    for (let i = 0; i < 7; i++) this.load.image('world' + i, '/assets/world/' + i + '.png');
  }
  create() {
    const texture = this.textures.createCanvas('world-layer', WIDTH, HEIGHT);
    if (!texture) throw Error('Canvas già registrato.');
    this.terrain = texture;
    this.terrain.context.imageSmoothingEnabled = false;
    this.add.image(0, 0, 'world-layer').setOrigin(0);
    this.cast = new CastView(this, this.terrain);
    this.map = new OverworldView(this, this.terrain, this.nodes, this.content.names);
    this.controls = new Controls();
    this.events.once('shutdown', () => this.controls?.destroy());
    this.events.once('destroy', () => this.controls?.destroy());
  }

  update(_: number, dt: number) {
    this.inputClock += Math.min(dt, 100);
    while (this.inputClock >= 1000 / 60) {
      this.live.update(this.controls?.sample() ?? 0);
      this.inputClock -= 1000 / 60;
    }
    const state = this.live.state,
      next = this.live.predicted;
    if (!state || !next || !this.terrain) return;
    if (state.phase !== 'playing') {
      this.cast.clear();
      this.map.draw(state);
      return;
    }
    this.map.hide();
    const localId = this.live.playerId;
    const local = next.players[localId];
    const peerId: PlayerId = localId === 'mario' ? 'luigi' : 'mario';
    const peer = state.players[peerId];
    const focus = local.status === 'spectator' ? peer : local;
    const stage = this.content.levels[focus.roomId],
      camera =
        scrollingCamera(stage, focus.scrollClock ?? 0) ??
        cameraFor(stage, focus.x + focus.width / 2, focus.y + focus.height / 2);
    if (stage.specialMode7) drawBossArena(this, this.terrain.context, stage.id, state, camera);
    else
      drawRoom(
        this.terrain.context,
        stage,
        this.textures.get(stage.atlas).getSourceImage() as HTMLImageElement,
        camera,
        state,
      );
    this.terrain.refresh();
    this.cast.draw(stage, camera, state, this.live, local, peer);
  }
}
