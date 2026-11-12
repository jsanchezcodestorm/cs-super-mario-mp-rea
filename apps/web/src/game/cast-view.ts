import Phaser from 'phaser';
import type { GameState, PlayerState } from '@smw/core';
import { drawMount } from './mount-view';
import { bossFrame } from './boss-view';
import { drawPlatform } from './platform-view';
import { frameForEntity, frameForPlayer } from './actors-view';
import type { Stage } from './content';
import type { Playback } from './playback';
import { WIDTH, HEIGHT, type Camera } from './terrain-view';

export class CastView {
  private actors = new Map<string, Phaser.GameObjects.Image>();
  constructor(
    private scene: Phaser.Scene,
    private terrain: Phaser.Textures.CanvasTexture,
  ) {}
  clear() {
    for (const actor of this.actors.values()) actor.destroy();
    this.actors.clear();
  }
  draw(
    stage: Stage,
    camera: Camera,
    state: GameState,
    live: Playback,
    local: PlayerState,
    peer: PlayerState,
  ) {
    const peerId = peer.id;
    const keep = new Set<string>(),
      blend = Math.min(1, (performance.now() - live.sampledAt) / (1000 / 30));
    const prev = live.previous,
      prevEntities = new Map(prev?.entities.map((e) => [e.id, e]));
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
      keep.add(key);
      let actor = this.actors.get(key);
      if (!actor) {
        actor = this.scene.add.image(0, 0, texture, frame).setOrigin(0.5, 1);
        this.actors.set(key, actor);
      }
      actor
        .setTexture(texture, frame)
        .setPosition(Math.round(x - camera.x), Math.round(y - camera.y))
        .setFlipX(flip)
        .setAlpha(alpha);
    };
    if (state.bonus?.roomId === stage.id) {
      for (const [index, slot] of state.bonus.slots.entries())
        draw('bonus-' + index, 'bonus/' + slot.frame, slot.x + 8, slot.y + 16, false, 1, 'creatures');
    }
    for (const e of state.entities) {
      if (!e.active || e.roomId !== stage.id) continue;
      const old = prevEntities.get(e.id),
        t = old?.roomId === stage.id ? blend : 1;
      const x = Phaser.Math.Linear(old?.x ?? e.x, e.x, t),
        y = Phaser.Math.Linear(old?.y ?? e.y, e.y, t);
      if (e.kind === 'platform' && drawPlatform(e, x, y, stage.spriteTileset, draw)) continue;
      if (e.kind === 'throwBlock') {
        this.drawTile(stage.atlas, 0x12e, x - camera.x, y - camera.y);
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
      const old = p.id === peerId ? prev?.players[p.id] : undefined,
        t = old?.roomId === stage.id ? blend : 1;
      const x = Phaser.Math.Linear(old?.x ?? p.x, p.x, t),
        y = Phaser.Math.Linear(old?.y ?? p.y, p.y, t);
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
