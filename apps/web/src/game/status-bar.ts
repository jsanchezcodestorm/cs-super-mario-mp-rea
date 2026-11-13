import { hudNumber } from './hud-number';
import type Phaser from 'phaser';
import type { GameState, PlayerState } from '@smw/core';

const assets = ['base-mario', 'base-luigi', 'digits', 'dragon', 'reserve'] as const;
type Asset = (typeof assets)[number];
const cell = 8;
const reserveFrame = { mushroom: 0, flower: 1, feather: 3 };

export function preloadStatusBar(scene: Phaser.Scene) {
  for (const name of assets) scene.load.image('hud/' + name, '/assets/hud/' + name + '.png');
}

// E1's BG3 status bar consists of four rows of 8px cells. The yellow
// clock and double-height bonus stars each use a separate cartridge palette.
export class StatusBar {
  private texture: Phaser.Textures.CanvasTexture;
  private image: Phaser.GameObjects.Image;
  private canvas: HTMLCanvasElement;
  private previous = '';
  private sheets: Record<Asset, HTMLImageElement>;
  constructor(scene: Phaser.Scene) {
    const texture = scene.textures.createCanvas('status-counters', 256, 32);
    if (!texture) throw Error('Texture della barra di stato già registrata.');
    this.texture = texture;
    this.canvas = scene.game.canvas;
    this.canvas.setAttribute('role', 'img');
    this.texture.context.imageSmoothingEnabled = false;
    this.image = scene.add.image(0, 0, texture).setOrigin(0, 0).setDepth(25).setVisible(false);
    this.sheets = Object.fromEntries(
      assets.map((name) => [name, scene.textures.get('hud/' + name).getSourceImage()]),
    ) as Record<Asset, HTMLImageElement>;
  }
  hide() {
    if (this.previous) {
      this.canvas.setAttribute('aria-label', 'Schermo di gioco');
      this.previous = '';
    }
    this.image.setVisible(false);
  }
  paint(ctx: CanvasRenderingContext2D, player: PlayerState, state: GameState) {
    this.draw(player, state);
    this.image.setVisible(false);
    ctx.drawImage(this.texture.canvas, 0, 0);
  }
  draw(player: PlayerState, state: GameState) {
    this.image.setVisible(true);
    const signature = [
      player.id,
      player.lives,
      player.coins,
      player.score,
      player.bonusStars,
      player.dragonCoins,
      player.reserve,
      state.timeLeft,
    ].join('/');
    if (this.previous === signature) return;
    this.previous = signature;
    const reserve = player.reserve
      ? { mushroom: 'fungo', flower: 'fiore', feather: 'piuma' }[player.reserve]
      : 'vuota';
    this.canvas.setAttribute(
      'aria-label',
      `${player.id === 'mario' ? 'Mario' : 'Luigi'}, ${player.lives} vite, ${player.coins} monete, ${
        player.score
      } punti, ${player.bonusStars} stelle bonus, tempo ${state.timeLeft}, riserva ${reserve}.`,
    );
    const ctx = this.texture.context;
    ctx.clearRect(0, 0, 256, 32);
    ctx.drawImage(this.sheets[player.id === 'mario' ? 'base-mario' : 'base-luigi'], 0, 0);
    this.number(player.lives, 32, 16, 2, 0);
    this.number(player.coins, 224, 8, 2, 0);
    this.number(player.score, 184, 16, 7, 0);
    this.number(player.bonusStars, 96, 8, 2, 16);
    this.number(state.timeLeft, 152, 16, 3, 8);
    if (player.dragonCoins < 5) {
      for (let i = 0; i < player.dragonCoins; i++) ctx.drawImage(this.sheets.dragon, 64 + i * cell, 8);
    }
    if (player.reserve) {
      ctx.drawImage(this.sheets.reserve, reserveFrame[player.reserve] * 16, 0, 16, 16, 120, 8, 16, 16);
    }
    this.texture.refresh();
  }
  private number(value: number, x: number, y: number, places: number, sourceY: 0 | 8 | 16) {
    hudNumber(this.texture.context, this.sheets.digits, value, x, y, places, sourceY);
  }
}
