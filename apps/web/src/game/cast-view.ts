import Phaser from 'phaser';
import type { GameState, PlayerState } from '@smw/core';
import { drawMount } from './mount-view';
import { bossFrame } from './boss-view';
import { drawPlatform } from './platform-view';
import { frameForEntity, frameForPlayer } from './actors-view';
import type { Stage } from './content';
import { WIDTH, HEIGHT, type Camera } from './terrain-view';

type Registration = Record<string, { x: number; y: number }>;

export class CastView {
  private actors = new Map<string, Phaser.GameObjects.Image>();
  private registration: Record<string, Registration>;
  constructor(
    private scene: Phaser.Scene,
    private terrain: Phaser.Textures.CanvasTexture,
    registration: Record<string, Registration>,
  ) {
    this.registration = registration;
  }
  clear() {
    for (const actor of this.actors.values()) actor.destroy();
    this.actors.clear();
  }
  draw(
    stage: Stage,
    camera: Camera,
    state: GameState,
    local: PlayerState,
    peer: PlayerState,
  ) {
    const keep = new Set<string>();
    const draw = (
      key: string,
      frame: string,
      x: number,
      y: number,
      flip: boolean,
      alpha = 1,
      texture = 'actors',
    ) => {
      if (x < camera.x - 80 || x > camera.x + WIDTH + 80 || y < camera.y - 80 || y > camera.y + HEIGHT + 80)
        return;
      const offset = this.registration[texture]?.[frame];
      keep.add(key);
      let actor = this.actors.get(key);
      if (!actor) {
        actor = this.scene.add.image(0, 0, texture, frame).setOrigin(0.5, 1);
        this.actors.set(key, actor);
      }
      actor
        .setTexture(texture, frame)
        .setPosition(
          Math.round(x + (flip ? -(offset?.x ?? 0) : (offset?.x ?? 0)) - camera.x),
          Math.round(y + (offset?.y ?? 0) - camera.y),
        )
        .setFlipX(flip)
        .setAlpha(alpha);
    };
    if (state.bonus?.roomId === stage.id) {
      for (const [index, slot] of state.bonus.slots.entries())
        draw('bonus-' + index, 'bonus/' + slot.frame, slot.x + 8, slot.y + 16, false, 1, 'creatures');
    }
    for (const e of state.entities) {
      if (!e.active || !e.height || (e.stunnedUntil && e.kind === 'boss' && e.stunnedUntil > e.age) || e.roomId !== stage.id) continue;
      const { x, y } = e;
      if (e.kind === 'platform' && drawPlatform(e, x, y, stage.spriteTileset, draw)) continue;
      if (e.kind === 'lakitu') {
        const cloud = frameForEntity({ ...e, spriteId: 0x87 }, state.tick, stage.spriteTileset, this.scene.textures.get('creatures'));
        if (cloud) draw(e.id + '-cloud', cloud.frame, x + e.width / 2, y + 32, false, 1, cloud.texture);
      }
      if (e.kind === 'throwBlock' || e.kind === 'directionalCoins') {
        const tile = e.kind === 'throwBlock' ? 0x12e : state.pSwitch ? 0x132 : 0x2b;
        this.drawTile(stage.atlas, tile, x - camera.x, y - camera.y);
        continue;
      }
      const pose =
        bossFrame(this.scene, e, state.tick) ??
        frameForEntity(e, state.tick, stage.spriteTileset, this.scene.textures.get('creatures'));
      if (!pose) continue;
      draw(e.id, pose.frame, x + e.width / 2, y + e.height, e.vx > 0, 1, pose.texture);
    }
    for (const p of [peer, local]) {
      if (p.roomId !== stage.id || p.status === 'spectator') continue;
      const { x, y } = p;
      drawMount(p, x, y, stage.spriteTileset, state.tick, draw);
      draw(
        p.id,
        frameForPlayer(p, state.tick, !!stage.water),
        x + p.width / 2 - (p.mounted ? p.facing * 4 : 0),
        y + p.height - (p.mounted ? 12 : 0),
        p.facing === 1,
        p.invincible > 0 && state.tick % 8 < 4 ? 0.45 : 1,
      );
    }
    for (const [id, actor] of this.actors)
      if (!keep.has(id)) {
        actor.destroy();
        this.actors.delete(id);
      }
  }
  private drawTile(atlas: string, tile: number, x: number, y: number) {
    const source = this.scene.textures.get(atlas).getSourceImage() as HTMLImageElement;
    this.terrain.context.drawImage(
      source,
      (tile % 32) * 16,
      Math.floor(tile / 32) * 16,
      16,
      16,
      Math.round(x),
      Math.round(y),
      16,
      16,
    );
    this.terrain.refresh();
  }
}
