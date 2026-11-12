import type { GameState } from '@smw/core';

export class CutsceneView {
  private key = '';
  private video = document.createElement('video');
  private still = document.createElement('img');
  private resumeSound = document.createElement('button');

  constructor(screen: HTMLElement) {
    this.video.playsInline = true;
    this.video.className = this.still.className = 'cinematic';
    this.still.alt = 'The End';
    this.resumeSound.className = 'resume-movie';
    this.resumeSound.textContent = 'Riproduci filmato';
    this.resumeSound.onclick = () => this.play();
    this.video.hidden = this.still.hidden = this.resumeSound.hidden = true;
    screen.append(this.video, this.still, this.resumeSound);
  }

  private play() {
    const key = this.key;
    void this.video
      .play()
      .then(() => {
        if (this.key === key) this.resumeSound.hidden = true;
      })
      .catch((error: DOMException) => {
        if (this.key === key && error.name === 'NotAllowedError') this.resumeSound.hidden = false;
      });
  }

  update(state: GameState, paused: boolean) {
    const scene = state.cutscene;
    if (!scene) {
      this.clear();
      if (state.phase === 'ending' && this.still.hidden) this.still.src = '/assets/movies/end.png';
      this.still.hidden = state.phase !== 'ending';
      return state.phase === 'ending';
    }
    this.still.hidden = true;
    const elapsed = (state.tick - scene.start) / 60;
    if (this.key !== scene.key) {
      this.key = scene.key;
      this.video.hidden = false;
      this.video.src = '/assets/movies/' + scene.key + '.mp4';
      this.video.load();
      if (!paused) this.play();
    } else if (this.video.readyState >= 1) {
      if (Math.abs(this.video.currentTime - elapsed) > 0.6)
        this.video.currentTime = Math.min(elapsed, this.video.duration);
      if (paused) this.video.pause();
      else if (this.video.paused && this.resumeSound.hidden && !this.video.ended) this.play();
    }
    return true;
  }

  clear() {
    if (this.key) {
      this.key = '';
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.hidden = this.resumeSound.hidden = true;
    }
  }

  close() {
    this.clear();
    this.still.hidden = true;
  }
}
