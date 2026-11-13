import type Phaser from 'phaser';
import { Buttons, palFrame, overworldTarget, type CampaignDefinition, type GameState, type OverworldNode, type OverworldStop, type PlayerId } from '@smw/core';
import { mapPresentation, drawReveal, type RevealData } from './map-reveal';
import { mapDecorations, drawMapDecorations } from './map-decorations';
import { drawMapTiles, type MapAnimation } from './map-events';
import { drawMapPlayers, mapActors } from './map-player';
import { HEIGHT, WIDTH } from './terrain-view';
import { touchDevice } from '../ui/touch-hud';

export type WorldNodes = Record<string, OverworldNode>;

const directions = { left: '←', up: '↑', right: '→', down: '↓' } as const;

function stopLabel(campaign: CampaignDefinition, id: string, stop: OverworldStop) {
  if (Object.hasOwn(campaign.routes, id)) return campaign.names?.[id] ?? id;
  if (stop.tile === 0x82) return 'Tubo';
  if (stop.tile === 0x5f) return 'Stella';
  return 'Incrocio';
}

function mapCommands(campaign: CampaignDefinition, state: GameState, id: string, stop: OverworldStop, localId: PlayerId) {
  const open = (button: number) => overworldTarget(campaign, state.progress.unlocked, id, button);
  const arrows = (Object.keys(directions) as (keyof typeof directions)[])
    .filter(direction => open(Buttons[direction]))
    .map(direction => directions[direction]);
  const commands: string[] = [];
  if (state.mapReply && state.mapReply.player !== localId && state.tick - state.mapReply.tick <= 120) {
    const other = state.mapReply.player === 'mario' ? 'Mario' : 'Luigi';
    return `${other} ha rifiutato · ${touchDevice.matches ? 'tocca Chiedi' : 'Z/Invio per riprovare'}`;
  }
  if (arrows.length) commands.push(arrows.join(' ') + ' Percorri');
  if (state.progress.unlocked.includes(id))
    commands.push(state.mode === 'solo' ? 'Z/Invio Avvia' : 'Z/Invio Chiedi di entrare');
  else if (open(Buttons.action)) commands.push(stop.tile === 0x82 ? 'Z/Invio Entra nel tubo' : 'Z/Invio Usa la stella');
  if (touchDevice.matches) return '';
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
    private localId: PlayerId,
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
    const reveals = this.scene.cache.json.get('map-reveals') as RevealData;
    const presentation = mapPresentation(state, reveals, this.localId);
    const { id, travel, reveal, arrival } = presentation;
    const paths = this.campaign.overworldPaths;
    if (!paths) throw Error('Percorsi della ROM assenti.');
    const stop = paths[id];
    if (!stop) throw Error('Posizione assente nella mappa della ROM: ' + id);
    const frame = palFrame(state.tick);
    const actors = mapActors(
      state,
      paths,
      reveals,
      this.scene.cache.json.get('map-poses'),
      frame,
    );
    const localActor = actors.find(actor => actor.id === this.localId);
    if (!localActor) throw Error('Giocatore non presente nella mappa: ' + this.localId);
    const position = localActor;
    const animation = (this.scene.cache.json.get('map-animation') as MapAnimation[])[position.region];
    const visibleActors = actors.filter(actor => actor.region === position.region);
    const phase = animation.phases[frame % animation.phases.length];
    const key = [
      state.phase, frame, id, !!travel, reveal?.age, position.region, Math.round(position.x), Math.round(position.y),
      progress.completed.join(','), progress.unlocked.join(','), phase, state.mode,
      state.mapRequest?.course, state.mapRequest?.requester, state.mapReply?.player, state.mapReply?.tick,
      ...visibleActors.flatMap(actor => [actor.id, actor.x, actor.y, actor.pose, actor.phase]),
      ...Object.values(state.players).map(p => p.mounted ? p.yoshiColor : 'foot'),
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
      drawMapTiles(this.scene, ctx, position.region, progress.completed, xOffset, yOffset, animation, phase, reveal);

      const decorations = mapDecorations(this.scene, state, position.region, frame, this.localId,
        { x: cameraX, y: cameraY }, travel, arrival, reveal);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, top, WIDTH, Math.min(180, img.height));
      ctx.clip();
      if (reveal) drawReveal(this.scene, ctx, reveals, reveal, xOffset, yOffset);
      drawMapDecorations(this.scene, ctx, decorations, xOffset, yOffset, false);
      const selectedNode = !travel && !reveal && progress.unlocked.includes(id) ? this.nodes[id] : undefined;
      if (selectedNode?.region === position.region) {
        drawCourseMarker(ctx, Math.round(selectedNode.x - cameraX), Math.round(selectedNode.y + yOffset));
      }
      drawMapPlayers(this.scene, ctx, state, visibleActors.map(actor => ({
        ...actor,
        x: Math.round(actor.x - cameraX),
        y: Math.round(actor.y + yOffset),
      })));
      drawMapDecorations(this.scene, ctx, decorations, xOffset, yOffset, true);
      ctx.restore();
    }
    this.terrain.refresh();
    if (state.phase === 'map') {
      const title = stopLabel(this.campaign, id, stop);
      const command = mapCommands(this.campaign, state, id, stop, this.localId);
      this.phaseLabel.setVisible(true).setText(travel || reveal || state.mapRequest ? title : [title, command]);
    } else this.phaseLabel.setVisible(true).setText(state.phase === 'ending' ? 'FINE' : 'GAME OVER');
  }
}
