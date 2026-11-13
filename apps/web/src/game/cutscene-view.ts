import type { GameState } from '@smw/core';

export class CutsceneView {
  private key = '';
  private elapsed = 0;
  private paused = false;
  private playPending = false;
  private video = document.createElement('video');
  private still = document.createElement('img');
  private resumeSound = document.createElement('button');

  constructor(screen: HTMLElement) {
    this.video.playsInline = true;
    this.video.addEventListener('loadedmetadata', () => this.sync());
    this.video.className = this.still.className = 'cinematic';
    this.still.alt = 'The End';
    this.resumeSound.className = 'resume-movie';
    this.resumeSound.textContent = 'Riproduci filmato';
    this.resumeSound.onclick = () => this.play();
    this.video.hidden = this.still.hidden = this.resumeSound.hidden = true;
    screen.append(this.video, this.still, this.resumeSound);
  }

  private play() {
    if (!this.key || this.paused || this.playPending) return;
    const key = this.key;
    this.playPending = true;
    void this.video
      .play()
      .then(() => {
        if (this.key === key) this.resumeSound.hidden = true;
      })
      .catch((error: DOMException) => {
        if (this.key === key && !this.paused && error.name === 'NotAllowedError') this.resumeSound.hidden = false;
      })
      .finally(() => { if (this.key === key) this.playPending = false; });
  }

  private sync() {
    if (!this.key || this.video.readyState < 1) return;
    const target = Math.min(this.elapsed, this.video.duration);
    if (!this.video.seeking && Math.abs(this.video.currentTime - target) > (this.paused ? 0.02 : 0.16))
      this.video.currentTime = target;
    if (this.paused) this.video.pause();
    else if (this.video.paused && this.resumeSound.hidden && !this.video.ended) this.play();
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
    this.elapsed = Math.max(0, (state.tick - scene.start) / 60);
    this.paused = paused;
    if (this.key !== scene.key) {
      this.key = scene.key;
      this.playPending = false;
      this.resumeSound.hidden = true;
      this.video.hidden = false;
      this.video.src = '/assets/movies/' + scene.key + '.mp4';
      this.video.load();
    }
    this.sync();
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
