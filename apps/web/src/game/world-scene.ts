import Phaser from 'phaser';
import { scrollingCamera } from '@smw/core';
import { preloadMapEvents } from './map-events';
import { StatusBar, preloadStatusBar } from './status-bar';
import { CastView } from './cast-view';
import { OverworldView, type WorldNodes } from './overworld-view';
import { preloadBosses, drawBossArena } from './boss-view';
import type { Controls } from './input';
import { cameraFor, drawRoom, HEIGHT, WIDTH } from './terrain-view';
import type { Content } from './content';
import type { GameSession } from './playback';

export class WorldScene extends Phaser.Scene {
  private terrain!: Phaser.Textures.CanvasTexture;
  private cast!: CastView;
  private statusBar!: StatusBar;
  private map!: OverworldView;
  private inputClock = 0;

  constructor(
    private content: Content,
    private live: GameSession,
    private nodes: WorldNodes,
    private controls: Controls,
  ) {
    super('world');
  }
  preload() {
    this.load.atlas('actors', '/assets/actors.png', '/assets/actors.json');
    this.load.atlas('creatures', '/assets/creatures.png', '/assets/creatures.json');
    this.load.json('actors-registration', '/assets/actors-registration.json');
    this.load.json('creatures-registration', '/assets/creatures-registration.json');
    preloadMapEvents(this);
    preloadStatusBar(this);
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
    this.statusBar = new StatusBar(this);
    this.cast = new CastView(this, this.terrain, {
      actors: this.cache.json.get('actors-registration'),
      creatures: this.cache.json.get('creatures-registration'),
    });
    this.map = new OverworldView(this, this.terrain, this.nodes, this.content);
  }

  update(_: number, dt: number) {
    this.inputClock += Math.min(dt, 100);
    while (this.inputClock >= 1000 / 60) {
      this.live.update(this.controls.sample());
      this.inputClock -= 1000 / 60;
    }
    const state = this.live.displayState;
    if (!state || !this.terrain) return;
    if (state.phase !== 'playing') {
      this.cast.clear();
      this.statusBar.hide();
      this.map.draw(state);
      return;
    }
    this.map.hide();
    const localId = this.live.playerId;
    const local = state.players[localId];
    const peerId = localId === 'mario' ? 'luigi' : 'mario';
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
    this.cast.draw(stage, camera, state, local, peer);
    const bowser = stage.specialMode7 && stage.sprites.some((s) => s.spriteId === 0xa0);
    if (bowser || state.cutscene) this.statusBar.hide();
    else this.statusBar.draw(state.players[localId], state);
  }
}
