import type Phaser from 'phaser';
import type { ObjectPlanes } from './object-planes';
import { blockItemPosition, isClassicPipePlant, isPipeBoss, keyholeAnchor, netDoorPhase, playerPipePosition, type GameState } from '@smw/core';
import { movingDoors } from './net-door-view';
import { drawMount, riderSeatOffset } from './mount-view';
import { bossFrame } from './boss-view';
import { drawPlatform, type DrawActor } from './platform-view';
import { frameForEntity } from './actors-view';
import { deathPosition, departing } from './death-animation';
import { drawBlockBounces, queueEffectTile } from './effect-tiles';
import { playerAppearance } from './player-effects';
import { playerFacingRight } from './player-animation';
import { drawnBehindNet } from './net-player';
import type { Stage } from './content';
import { WIDTH, HEIGHT, type Camera } from './terrain-view';

interface Layer { frame: string; priority: number; oam: number }
type Registration = Record<string, { x: number; y: number; mountedX?: number; priority: number; oam: number; layers?: Layer[] }>;

export class CastView {
  private registration: Record<string, Registration>;
  constructor(
    private scene: Phaser.Scene,
    private objects: ObjectPlanes,
    registration: Record<string, Registration>,
  ) {
    this.registration = registration;
  }
  draw(
    stage: Stage,
    camera: Camera,
    state: GameState,
  ) {

    const draw = (
      _key: string,
      frame: string,
      x: number,
      y: number,
      flip: boolean,
      alpha = 1,
      texture = 'actors',
      flipY = false,
      captured?: { priority: number; oam: number },
      priorityOverride?: number,
      riding = false,
      oamOffset = 0,
    ) => {
      if (x < camera.x - 80 || x > camera.x + WIDTH + 80 || y < camera.y - 80 || y > camera.y + HEIGHT + 80)
        return;
      const offset = this.registration[texture]?.[frame];
      const source = this.scene.textures.get(texture);
      const offsetX = riding ? offset.mountedX! : offset?.x ?? 0;
      const order = captured ?? offset;
      if (!order) throw Error('Registrazione OAM assente: ' + texture + '/' + frame);
      const layers = offset?.layers ?? [{ frame, priority: order.priority, oam: order.oam }];
      for (const layer of layers) {
        const f = source.get(layer.frame);
        this.objects.queue({
          image: f.source.image as HTMLImageElement, sx: f.cutX, sy: f.cutY, w: f.cutWidth, h: f.cutHeight,
          x: Math.round(x + (flip ? -1 : 1) * offsetX - camera.x - f.cutWidth / 2),
          y: Math.round(y + (offset?.y ?? 0) - camera.y - f.cutHeight),
          flipX: flip, flipY, alpha, priority: priorityOverride ?? layer.priority, oam: layer.oam + oamOffset,
        });
      }
    };
    for (const door of movingDoors(state, stage.id) ?? [])
      draw('net-door', stage.spriteTileset + '-84/' + netDoorPhase(door, state.tick),
        door.x + 32, door.y + 55, false, 1, 'creatures');
    if (state.bonus?.roomId === stage.id) {
      for (const [index, slot] of state.bonus.slots.entries())
        draw('bonus-' + index, 'bonus/' + slot.frame, slot.x + 8, slot.y + 16, false, 1, 'creatures');
    }
    for (const e of state.entities) {
      if ((!e.active && !e.shellKnockedOut) || !e.height || (e.stunnedUntil && e.kind === 'boss' && e.stunnedUntil > e.age) || e.roomId !== stage.id) continue;
      const { x, y } = e;
      const plant = e.kind === 'plant' ? e.pipePlant : undefined;
      if (plant?.hidden) continue;
      if (e.kind === 'flyingQuestion' && e.questionHit) {
        const age = Math.floor((state.tick - e.questionHit.tick) * 5 / 6);
        const lift = [0, 3, 5, 7, 8, 8, 7, 5, 3][Math.floor(age / 2)] ?? 0;
        this.drawTile(stage.atlas, 0x132, x - camera.x, y - camera.y - lift);
        continue;
      }
      if (e.kind === 'platform' && drawPlatform(e, x, y, stage.spriteTileset, draw)) continue;
      if (e.kind === 'lakitu' && !e.shellKnockedOut) {
        const cloud = frameForEntity({ ...e, spriteId: 0x87 }, state.tick, stage.spriteTileset, this.scene.textures.get('creatures'));
        if (cloud) draw(e.id + '-cloud', cloud.frame, x + e.width / 2, y + 32, false, 1, cloud.texture);
      }
      if (e.kind === 'throwBlock' || e.kind === 'directionalCoins') {
        const tile = e.kind === 'throwBlock' ? 0x12e : state.pSwitch ? 0x132 : 0x2b;
        this.drawTile(stage.atlas, tile, x - camera.x, y - camera.y);
        continue;
      }
      const boss = bossFrame(this.scene, e);
      const order = boss && 'priority' in boss.registration ? boss.registration : undefined;
      if (boss && !order) continue;
      const pose = boss ?? frameForEntity(e, state.tick, stage.spriteTileset, this.scene.textures.get('creatures'));
      if (!pose) continue;
      const emerging = blockItemPosition(e, state.tick);
      if (emerging && !emerging.visible) continue;
      // A pipe boss's collision height is the exposed part of its 32 px body.
      // Anchor the full drawing to its moving head and let the pipe mask OBJ1.
      const height = boss && isPipeBoss(e) ? 32 : e.height;
      const anchor = e.kind === 'keyhole' ? keyholeAnchor(e) :
        { x: (emerging?.x ?? x) + e.width / 2, y: (emerging?.y ?? plant?.drawY ?? y) + height };
      draw(e.id, pose.frame, anchor.x, anchor.y, e.vx > 0, 1, pose.texture,
        e.shellKnockedOut, order, emerging ? 1 : undefined);
    }
    for (const p of [state.players.luigi, state.players.mario]) {
      if (p.roomId !== stage.id) continue;
      if (departing(p, state.tick)) {
        const point = deathPosition(p, state.tick, this.scene.cache.json.get('death-arc'));
        draw(p.id, p.id + '/small/62', point.x + p.width / 2, point.y + 16, point.flip);
        continue;
      }
      if (p.status === 'spectator') continue;
      const emerging = playerPipePosition(p, state.tick);
      const { x, y } = emerging ?? p;
      const behindNet = !emerging && !p.mounted && drawnBehindNet(p, state.tick);
      // The classic Piranha routine releases OBJ1 while it is on Yoshi's tongue.
      const caughtPlant = p.mouth && isClassicPipePlant(p.mouth.spriteId) ? p.mouth.entityId : undefined;
      const drawPlayer: DrawActor = (key, frame, cx, bottom, flip, alpha, texture) =>
        draw(key, frame, cx, bottom, flip, alpha, texture, false, undefined, emerging || behindNet ? 1 : key === caughtPlant ? 2 : undefined,
          p.mounted && !texture, behindNet && !texture ? 49 : 0);
      drawMount(p, x, y, stage.spriteTileset, state, drawPlayer, this.objects, this.scene.textures.get('creatures'));
      const look = playerAppearance(p, state.tick, state.goalWalk);
      if (look.smoke !== undefined) {
        const image = this.scene.textures.get('reward-tiles').getSourceImage() as HTMLImageElement;
        queueEffectTile(this.objects, image, 18 + look.smoke, x + p.width / 2 - 8 - camera.x, y + p.height - 24 - camera.y, 2, 11);
      }
      if (look.visible) drawPlayer(
        p.id,
        look.frame,
        x + p.width / 2,
        y + p.height - (p.mounted ? 10 - riderSeatOffset(p, state.tick) : 0),
        playerFacingRight(p, state.tick),
      );
    }
    if (state.bouncingBlocks?.length) {
      const sheet = this.scene.textures.get('reward-tiles').getSourceImage() as HTMLImageElement;
      drawBlockBounces(this.objects, sheet, state.bouncingBlocks, state.tick, stage.id, camera);
    }
  }
  private drawTile(atlas: string, tile: number, x: number, y: number, priority = 2, oam = 64) {
    this.objects.queue({
      image: this.scene.textures.get(atlas).getSourceImage() as HTMLImageElement,
      sx: (tile % 32) * 16, sy: (tile >> 5) * 16, w: 16, h: 16, x: Math.round(x), y: Math.round(y), priority, oam,
    });
  }
}
