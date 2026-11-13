import { departing } from './death-animation';
import Phaser from 'phaser';
import { goalCoinHud, goalWalkFrame, keyholeFrame, scrollingCamera } from '@smw/core';
import { drawKeyhole } from './keyhole-view';
import { preloadMapReveals } from './map-reveal';
import { preloadMapPlayers } from './map-player';
import { preloadMapDecorations } from './map-decorations';
import { preloadMapEvents } from './map-events';
import { hasNetDoor, netDoorTexture } from './net-door-view';
import { StatusBar, preloadStatusBar } from './status-bar';
import { ObjectPlanes } from './object-planes';
import { RewardView } from './reward-view';
import { CastView } from './cast-view';
import { OverworldView, type WorldNodes } from './overworld-view';
import { preloadBosses, drawBossArena, queueArenaScenery } from './boss-view';
import { preloadBooGroups, queueBooGroups } from './boo-cluster-view';
import type { Controls } from './input';
import { cameraFor, drawRoom, HEIGHT, WIDTH } from './terrain-view';
import { drawCourseClear } from './course-clear';
import { drawOrbFinish } from './orb-finish-view';
import { GoalFade } from './goal-fade';
import { drawGoalIris } from './goal-iris';
import { SceneTransition } from './scene-transition';
import type { Content } from './content';
import type { GameSession } from './playback';

export class WorldScene extends Phaser.Scene {
  private terrain!: Phaser.Textures.CanvasTexture;
  private objects!: ObjectPlanes;
  private priority!: { atlases: Record<string, number[]>; screens: { main: number; sub: number }[] };
  private cast!: CastView;
  private rewards!: RewardView;
  private statusBar!: StatusBar;
  private goalFade!: GoalFade;
  private transition!: SceneTransition;
  private map!: OverworldView;
  private inputClock = 0;
  private displayedScene?: string;

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
    this.load.json('death-arc', '/assets/player-death.json');
    this.load.json('actors-registration', '/assets/actors-registration.json');
    this.load.json('creatures-registration', '/assets/creatures-registration.json');
    this.load.image('tide', '/assets/tiles/tide.png');
    this.load.json('map16-priorities', '/assets/tiles/priorities.json');
    preloadMapEvents(this);
    preloadMapDecorations(this);
    preloadMapPlayers(this);
    preloadMapReveals(this);
    preloadStatusBar(this);
    this.load.image('goal-coins', '/assets/hud/goal-coins.png');
    this.load.image('goal-stars', '/assets/hud/goal-stars.png');
    this.load.json('goal-star-layout', '/assets/hud/goal-stars.json');
    this.load.json('goal-fade', '/assets/hud/goal-fade.json');
    for (const seat of ['mario', 'luigi']) this.load.image('hud/course-' + seat, '/assets/hud/course-' + seat + '.png');
    this.load.json('goal-palettes', '/assets/tiles/goal-palettes.json');
    this.load.spritesheet('reward-tiles', '/assets/hud/rewards.png', { frameWidth: 16, frameHeight: 16 });
    preloadBosses(this);
    preloadBooGroups(this);
    for (const atlas of new Set(Object.values(this.content.levels).filter(hasNetDoor).map(s => s.atlas))) {
      const file = netDoorTexture(atlas);
      this.load.image(file, '/assets/' + file);
    }
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
    this.objects = new ObjectPlanes(WIDTH, HEIGHT);
    this.priority = this.cache.json.get('map16-priorities');
    this.rewards = new RewardView(this, this.objects);
    this.statusBar = new StatusBar(this);
    this.goalFade = new GoalFade(this);
    this.cast = new CastView(this, this.objects, {
      actors: this.cache.json.get('actors-registration'),
      creatures: this.cache.json.get('creatures-registration'),
    });
    this.map = new OverworldView(this, this.terrain, this.nodes, this.content);
    this.transition = new SceneTransition(this, WIDTH, HEIGHT);
  }

  update(_: number, dt: number) {
    this.inputClock += Math.min(dt, 100);
    while (this.inputClock >= 1000 / 60) {
      this.live.update(this.controls.sample());
      this.inputClock -= 1000 / 60;
    }
    const state = this.live.displayState;
    if (!state || !this.terrain) return;
    const finalDeath = state.phase === 'gameOver' && Object.values(state.players).some(p => departing(p, state.tick));
    const hole = state.keyholeFinish;
    const orb = state.orbFinish;
    const mapVisible = state.phase !== 'playing' && !finalDeath && !state.goalWalk && !hole && !orb;
    const sceneKey = mapVisible ? 'map' : `course:${state.progress.course}`;
    const sceneChanged = this.displayedScene !== undefined && this.displayedScene !== sceneKey;
    if (sceneChanged) this.transition.capture(this.game.canvas);
    this.displayedScene = sceneKey;
    this.transition.update(sceneChanged ? 0 : dt);
    if (mapVisible) {
      this.statusBar.hide();
      this.map.draw(state);
      return;
    }
    this.map.hide();
    const localId = this.live.playerId;
    const local = state.players[localId];
    const peerId = localId === 'mario' ? 'luigi' : 'mario';
    const peer = state.players[peerId];
    const finisher = state.goalWalk?.finisher ?? hole?.finisher ?? orb?.finisher;
    const focus = finisher ? state.players[finisher] :
      local.status === 'spectator' && !departing(local, state.tick) ? peer : local;
    const stage = this.content.levels[focus.roomId],
      camera =
        scrollingCamera(stage, focus.scrollClock ?? 0) ??
        cameraFor(stage, focus.x + focus.width / 2, (focus.death?.y ?? focus.y) + focus.height / 2);
    const frozen = hole ?? orb;
    const frameState = frozen ? { ...state, tick: frozen.tick } : state;
    this.cast.draw(stage, camera, frameState);
    queueBooGroups(this, this.objects, stage.id, frameState, camera);
    this.rewards.draw(frameState, stage.id, camera);
    if (stage.specialMode7) queueArenaScenery(this, this.objects, stage.id);
    this.objects.compose();
    if (stage.specialMode7) {
      drawBossArena(this, this.terrain.context, stage.id, state, camera, this.objects);
    }
    else {
      const image = this.textures.get(stage.atlas).getSourceImage() as HTMLImageElement;
      const fade = state.goalWalk && this.goalFade.draw(stage, image, state.goalWalk, state.tick);
      const routing = this.priority.screens[stage.mode];
      const hideObjects = hole && keyholeFrame(hole.tick, state.tick).closing;
      drawRoom(
        this.terrain.context,
        stage,
        fade?.atlas ?? image,
        camera,
        frameState, this.priority.atlases[stage.atlas], this.objects,
        hideObjects ? { sub: routing.sub & ~16, main: routing.main & ~16 } : routing,
        this.textures.get('tide').getSourceImage() as HTMLImageElement,
        state.netDoors?.some(d => d.roomId === stage.id) ?
          this.textures.get(netDoorTexture(stage.atlas)).getSourceImage() as HTMLImageElement : undefined,
        fade?.backdrop,
      );
    }
    if (state.goalWalk) {
      const tally = drawCourseClear(this, this.terrain.context, state, state.goalWalk);
      const bonus = state.goalWalk.coins;
      const funds = bonus && goalCoinHud(bonus, goalWalkFrame(state.goalWalk, state.tick).age);
      const bonusStars = (focus.bonusStars + (state.goalWalk.bonus ? 100 : 0) - tally.hudStars) % 100;
      this.statusBar.paint(this.terrain.context, { ...focus, ...funds, score: tally.score, bonusStars }, state);
    }
    if (state.goalWalk) drawGoalIris(this.terrain.context, state, focus, camera, this.cache.json.get('goal-fade').window);
    if (orb) drawOrbFinish(this, this.terrain.context, state, this.statusBar);
    if (hole) {
      this.statusBar.paint(this.terrain.context, local, state);
      drawKeyhole(this.terrain.context, hole, state.tick, camera, this.cache.json.get('goal-fade').keyhole, this.objects);
    }
    this.terrain.refresh();
    const bowser = stage.specialMode7 && stage.sprites.some((s) => s.spriteId === 0xa0);
    if (state.goalWalk || hole || orb) return;
    if (bowser || state.cutscene) this.statusBar.hide();
    else this.statusBar.draw(state.players[localId], state);
  }
}
