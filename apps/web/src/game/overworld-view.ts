import type Phaser from 'phaser';
import type { GameState } from '@smw/core';
import { drawMapEvents } from './map-events';
import { HEIGHT, WIDTH } from './terrain-view';
export interface WorldNodes {
  [course: string]: { region: number; x: number; y: number };
}

export class OverworldView {
  private currentCourse = '';
  private phaseLabel: Phaser.GameObjects.Text;
  constructor(
    private scene: Phaser.Scene,
    private terrain: Phaser.Textures.CanvasTexture,
    private nodes: WorldNodes,
    private names?: Record<string, string>,
  ) {
    this.phaseLabel = this.scene.add
      .text(WIDTH / 2, HEIGHT - 7, '', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffffff',
        stroke: '#17332c',
        strokeThickness: 3,
        align: 'center',
        backgroundColor: '#18352a',
        padding: { x: 6, y: 4 },
      })
      .setOrigin(0.5, 1)
      .setDepth(10);
  }
  hide() {
    this.currentCourse = '';
    this.phaseLabel.setVisible(false);
  }
  draw(state: GameState) {
    const progress = state.progress,
      course = progress.unlocked[progress.selection] ?? progress.course;
    if (this.currentCourse === state.phase + course) return;
    this.currentCourse = state.phase + course;
    const ctx = this.terrain.context,
      node = this.nodes[course];
    ctx.fillStyle = '#143345';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (node && this.scene.textures.exists('world' + node.region)) {
      const img = this.scene.textures.get('world' + node.region).getSourceImage() as HTMLImageElement;
      const cameraX = Math.max(0, Math.min(img.width - WIDTH, node.x - WIDTH / 2));
      const cameraY = Math.max(0, Math.min(img.height - 180, node.y - 90));
      const top = Math.max(0, Math.round((180 - img.height) / 2));
      ctx.drawImage(img, -cameraX, top - cameraY);
      drawMapEvents(this.scene, ctx, node.region, progress.completed, -cameraX, top - cameraY);
      const x = Math.round(node.x - cameraX),
        y = Math.round(node.y + top - cameraY);
      ctx.strokeStyle = '#241b23';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 6, y - 6, 12, 12);
      ctx.strokeStyle = '#ffef79';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 6, y - 6, 12, 12);
    }
    this.terrain.refresh();
    const name = this.names?.[course] ?? course;
    this.phaseLabel
      .setVisible(true)
      .setText(
        state.phase === 'map'
          ? [name, '← → Scegli   Z Entra']
          : state.phase === 'ending'
            ? 'FINE'
            : 'GAME OVER',
      );
  }
}
