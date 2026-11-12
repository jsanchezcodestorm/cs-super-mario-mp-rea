import type Phaser from 'phaser';
import { Buttons, mapPosition, overworldTarget, type CampaignDefinition, type GameState, type OverworldNode, type OverworldStop } from '@smw/core';
import { pathPosition } from './overworld-path';
import { drawMapEvents } from './map-events';
import { drawMapPlayer } from './map-player';
import { HEIGHT, WIDTH } from './terrain-view';

export type WorldNodes = Record<string, OverworldNode>;

const directions = { left: '←', up: '↑', right: '→', down: '↓' } as const;

function stopLabel(campaign: CampaignDefinition, id: string, stop: OverworldStop) {
  if (Object.hasOwn(campaign.routes, id)) return campaign.names?.[id] ?? id;
  if (stop.tile === 0x82) return 'Tubo';
  if (stop.tile === 0x5f) return 'Stella';
  return 'Incrocio';
}

function mapCommands(campaign: CampaignDefinition, state: GameState, id: string, stop: OverworldStop) {
  const open = (button: number) => overworldTarget(campaign, state.progress.unlocked, id, button);
  const arrows = (Object.keys(directions) as (keyof typeof directions)[])
    .filter(direction => open(Buttons[direction]))
    .map(direction => directions[direction]);
  const commands: string[] = [];
  if (arrows.length) commands.push(arrows.join(' ') + ' Percorri');
  if (!state.mapStop) commands.push('Z/Invio Avvia');
  else if (open(Buttons.action)) commands.push(stop.tile === 0x82 ? 'Z/Invio Entra nel tubo' : 'Z/Invio Usa la stella');
  return commands.join(' · ');
}

function drawCourseMarker(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#241b23';
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 6, y - 6, 12, 12);
  ctx.strokeStyle = '#ffef79';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 6, y - 6, 12, 12);
}

export class OverworldView {
  private currentKey = '';
  private phaseLabel: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private terrain: Phaser.Textures.CanvasTexture,
    private nodes: WorldNodes,
    private campaign: CampaignDefinition,
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
    this.currentKey = '';
    this.phaseLabel.setVisible(false);
  }

  draw(state: GameState) {
    const progress = state.progress;
    const travel = state.mapTravel;
    const id = travel?.to ?? state.mapStop ?? progress.unlocked[progress.selection];
    const paths = this.campaign.overworldPaths;
    if (!paths) throw Error('Percorsi della ROM assenti.');
    const stop = paths[id];
    if (!stop) throw Error('Posizione assente nella mappa della ROM: ' + id);
    let position = mapPosition(stop.position);
    if (travel) {
      const edge = paths[travel.from].directions[travel.command];
      if (!edge) throw Error('Tratto assente nella mappa della ROM: ' + travel.from + '/' + travel.command);
      position = pathPosition(edge, travel.elapsed);
    }
    const key = [
      state.phase, id, !!travel, position.region, Math.round(position.x), Math.round(position.y),
      progress.completed.length, progress.unlocked.length,
    ].join(':');
    if (this.currentKey === key) return;
    this.currentKey = key;

    const ctx = this.terrain.context;
    ctx.fillStyle = '#143345';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    if (this.scene.textures.exists('world' + position.region)) {
      const img = this.scene.textures.get('world' + position.region).getSourceImage() as HTMLImageElement;
      const cameraX = Math.max(0, Math.min(img.width - WIDTH, Math.round(position.x) - WIDTH / 2));
      const cameraY = Math.max(0, Math.min(img.height - 180, Math.round(position.y) - 90));
      const top = Math.max(0, Math.round((180 - img.height) / 2));
      const xOffset = -cameraX;
      const yOffset = top - cameraY;
      ctx.drawImage(img, xOffset, yOffset);
      drawMapEvents(this.scene, ctx, position.region, progress.completed, xOffset, yOffset);

      const selectedNode = !travel && !state.mapStop ? this.nodes[id] : undefined;
      if (selectedNode?.region === position.region) {
        drawCourseMarker(ctx, Math.round(selectedNode.x - cameraX), Math.round(selectedNode.y + yOffset));
      }
      drawMapPlayer(ctx, Math.round(position.x - cameraX), Math.round(position.y + yOffset));
    }
    this.terrain.refresh();
    if (state.phase === 'map') {
      const title = stopLabel(this.campaign, id, stop);
      this.phaseLabel.setVisible(true).setText(travel ? title : [title, mapCommands(this.campaign, state, id, stop)]);
    } else this.phaseLabel.setVisible(true).setText(state.phase === 'ending' ? 'FINE' : 'GAME OVER');
  }
}
