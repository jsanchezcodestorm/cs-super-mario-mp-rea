import Phaser from 'phaser';

const duration = 280;

export class SceneTransition {
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly image: Phaser.GameObjects.Image;
  private elapsed = duration;

  constructor(scene: Phaser.Scene, width: number, height: number) {
    const texture = scene.textures.createCanvas('scene-transition', width, height);
    if (!texture) throw Error('Texture della transizione già registrata.');
    this.texture = texture;
    this.texture.context.imageSmoothingEnabled = false;
    this.image = scene.add.image(0, 0, 'scene-transition')
      .setOrigin(0)
      .setDepth(1000)
      .setVisible(false);
  }

  capture(source: HTMLCanvasElement) {
    this.texture.context.clearRect(0, 0, this.texture.canvas.width, this.texture.canvas.height);
    this.texture.context.drawImage(source, 0, 0, this.texture.canvas.width, this.texture.canvas.height);
    this.texture.refresh();
    this.elapsed = 0;
    this.image.setAlpha(1).setVisible(true);
  }

  update(dt: number) {
    if (this.elapsed >= duration) return;
    this.elapsed = Math.min(duration, this.elapsed + dt);
    const progress = this.elapsed / duration;
    this.image.setAlpha((1 - progress) ** 2);
    if (progress === 1) this.image.setVisible(false);
  }
}
