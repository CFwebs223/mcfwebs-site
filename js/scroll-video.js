/* ==========================================================================
   ScrollVideo — Buttery-smooth scroll-scrubbed koi sequence.

   Uses the same technique as riptide-website: the source video is
   pre-extracted into a JPG frame sequence, preloaded as Image objects,
   and drawn to a <canvas> with drawImage() on scroll. This avoids
   <video>.currentTime seeking entirely, which is the actual source of
   scrub stutter (every seek has to decode from the nearest keyframe).
   A plain canvas draw of an already-decoded image has no such latency.
   ========================================================================== */

class ScrollVideo {
  constructor() {
    this.section = document.querySelector('.scroll-video');
    this.sticky = document.querySelector('.scroll-video-sticky');
    this.canvas = document.getElementById('scroll-video-canvas');
    this.progressBar = document.querySelector('.scroll-video-progress-fill');
    this.progressPct = document.querySelector('.scroll-video-progress-pct');

    if (!this.sticky || !this.section || !this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.ready = false;
    this.lastTextPhase = -1;
    this.targetProgress = 0;
    this.currentProgress = 0;

    this.totalFrames = 192;
    this.frames = [];
    this.isMobile = window.innerWidth < 768;
    this.frameDir = this.isMobile ? 'mobile_frames' : 'pc_frames';

    this.phases = [
      { start: 0, end: 0.2, label: 'The Beginning', title: 'A Single\nStroke', desc: 'Every creation begins as a moment of intention — ink meeting paper.' },
      { start: 0.25, end: 0.45, label: 'Flow', title: 'Finding the\nCurrent', desc: 'The koi navigates with purpose, turning resistance into momentum.' },
      { start: 0.5, end: 0.7, label: 'Emergence', title: 'Form from\nWater', desc: 'Ideas crystallize. The abstract becomes the unmistakable.' },
      { start: 0.75, end: 1.0, label: 'Expression', title: 'The Final\nReveal', desc: 'What was once in the mind now commands the space it occupies.' }
    ];

    this._init();
  }

  _init() {
    this._resizeCanvas();
    window.addEventListener('resize', () => this._resizeCanvas(), { passive: true });

    this._preloadFrames().then(() => {
      this.ready = true;
      this.canvas.classList.add('visible');
      this._drawFrame(0);
      window.addEventListener('scroll', () => this._onScroll(), { passive: true });
      this._onScroll();
      this._loop();
    });
  }

  _preloadFrames() {
    // Only gate readiness on frame 0 — firing all 192 requests at once
    // and waiting for every single one to finish (as this used to do)
    // means a page load hangs on the loading screen (and shows a black
    // canvas) whenever the browser's connection queue makes even one
    // of those 192 requests slow. The rest keep loading in the
    // background; _drawFrame() already skips undrawn frames until they
    // arrive, so playback just catches up as they land.
    return new Promise((resolve) => {
      let resolved = false;
      for (let i = 0; i < this.totalFrames; i++) {
        const img = new Image();
        const idx = String(i).padStart(5, '0');
        if (i === 0) {
          const done = () => { if (!resolved) { resolved = true; resolve(); } };
          img.onload = done;
          img.onerror = done;
        }
        img.src = `videos/${this.frameDir}/frame_${idx}.jpg`;
        this.frames[i] = img;
      }
    });
  }

  _resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (this.ready) this._drawFrame(this._frameForProgress(this.currentProgress));
  }

  scrollStarted() {
    this.canvas.classList.add('visible');
  }

  scrollBack() {
    this.targetProgress = 0;
  }

  _onScroll() {
    if (!this.ready) return;

    const rect = this.section.getBoundingClientRect();
    const total = this.section.offsetHeight - window.innerHeight;
    if (total <= 0) return;

    const progress = Math.min(1, Math.max(0, -rect.top / total));
    this.targetProgress = progress;

    if (this.progressBar) this.progressBar.style.height = (progress * 100) + '%';
    if (this.progressPct) this.progressPct.textContent = Math.round(progress * 100) + '%';

    this._updateText(progress);
  }

  _frameForProgress(progress) {
    return Math.max(0, Math.min(this.totalFrames - 1, Math.round(progress * (this.totalFrames - 1))));
  }

  _drawFrame(index) {
    const img = this.frames[index];
    if (!img || !img.complete || !img.naturalWidth) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;

    this.ctx.clearRect(0, 0, cw, ch);
    this.ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    // Lenis already smooths the scroll input; a light lerp here just
    // removes any last one-frame-tick sharpness on the frame switch.
    const diff = this.targetProgress - this.currentProgress;
    this.currentProgress += diff * 0.35;
    if (Math.abs(diff) < 0.0005) this.currentProgress = this.targetProgress;

    this._drawFrame(this._frameForProgress(this.currentProgress));
  }

  _updateText(progress) {
    let idx = -1;
    for (let i = 0; i < this.phases.length; i++) {
      if (progress >= this.phases[i].start && progress < this.phases[i].end) { idx = i; break; }
    }
    if (idx === this.lastTextPhase) return;

    const le = document.querySelector('.scroll-text-label');
    const te = document.querySelector('.scroll-text-title');
    const de = document.querySelector('.scroll-text-desc');

    if (le) le.classList.remove('visible');
    if (te) te.classList.remove('visible');
    if (de) de.classList.remove('visible');

    this.lastTextPhase = idx;
    if (idx < 0) return;

    const p = this.phases[idx];

    setTimeout(() => {
      if (idx !== this.lastTextPhase) return;
      if (le) { le.textContent = p.label; le.classList.add('visible'); }
      if (te) { te.innerHTML = p.title; te.classList.add('visible'); }
      if (de) { de.textContent = p.desc; de.classList.add('visible'); }
    }, 150);
  }
}
