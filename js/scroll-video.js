/* ==========================================================================
   ScrollVideo — 25fps scroll-driven video playback
   Renders frames to a display canvas. Pre-renders frames behind the scenes
   to eliminate lag. Falls back to live seeking for uncached frames.
   ========================================================================== */

class ScrollVideo {
  constructor() {
    this.section = document.querySelector('.scroll-video');
    this.sticky = document.querySelector('.scroll-video-sticky');
    this.progressBar = document.querySelector('.scroll-video-progress-fill');
    this.progressPct = document.querySelector('.scroll-video-progress-pct');

    if (!this.sticky) return;

    this.totalFrames = 0;
    this.fps = 25;
    this.ready = false;
    this.lastTextPhase = -1;

    // Source video (hidden, used for decode only)
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.loop = false;
    this.video.preload = 'auto';

    // Display canvas
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scroll-video-canvas';
    this.ctx = null;
    this.cw = 0;
    this.ch = 0;
    this.dx = 0; this.dy = 0; this.dw = 0; this.dh = 0;

    // Frame cache: key is frame number, value is ImageData
    this.cache = {};
    this.currentFrame = -1;
    this.totalCached = 0;

    this.phases = [
      { start: 0, end: 0.2, label: 'The Beginning', title: 'A Single\nStroke', desc: 'Every creation begins as a moment of intention — ink meeting paper.' },
      { start: 0.25, end: 0.45, label: 'Flow', title: 'Finding the\nCurrent', desc: 'The koi navigates with purpose, turning resistance into momentum.' },
      { start: 0.5, end: 0.7, label: 'Emergence', title: 'Form from\nWater', desc: 'Ideas crystallize. The abstract becomes the unmistakable.' },
      { start: 0.75, end: 1.0, label: 'Expression', title: 'The Final\nReveal', desc: 'What was once in the mind now commands the space it occupies.' }
    ];

    this._init();
  }

  async _init() {
    try {
      const src = document.createElement('source');
      src.src = 'videos/scroll-koi.mp4';
      src.type = 'video/mp4';
      this.video.appendChild(src);

      await new Promise((resolve, reject) => {
        this.video.addEventListener('loadedmetadata', resolve, { once: true });
        this.video.addEventListener('error', (e) => { if (this.video.duration > 0) resolve(); else reject(e); }, { once: true });
        this.video.load();
      });

      if (!this.video.duration || this.video.duration <= 0) throw new Error('No duration');

      this.totalFrames = Math.floor(this.video.duration * this.fps);

      // Size canvas
      this._resize();

      // Insert canvas into DOM (after sticky but before overlays)
      this.sticky.insertBefore(this.canvas, this.sticky.firstChild);
      this.ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: false });

      // Seek first frame and cache it
      await this._cacheOneFrame(0);

      // Draw first frame
      this.currentFrame = 0;
      this._drawFrame();
      this.ready = true;
      this.canvas.classList.add('visible');

      // Cache remaining frames in background
      this._cacheAllFrames();

      window.addEventListener('scroll', () => this._onScroll(), { passive: true });
      window.addEventListener('resize', () => this._resize(), { passive: true });
    } catch (e) {
      console.warn('ScrollVideo init failed:', e);
      if (this.section) this.section.style.display = 'none';
    }
  }

  _resize() {
    const rect = this.sticky.getBoundingClientRect();
    this.cw = rect.width || window.innerWidth;
    this.ch = rect.height || window.innerHeight;
    this.canvas.width = this.cw;
    this.canvas.height = this.ch;

    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    const scale = Math.max(this.cw / vw, this.ch / vh);
    this.dw = Math.ceil(vw * scale);
    this.dh = Math.ceil(vh * scale);
    this.dx = Math.floor((this.cw - this.dw) / 2);
    this.dy = Math.floor((this.ch - this.dh) / 2);
  }

  // Seek to ONE frame, draw it to temp canvas, cache as ImageData
  _cacheOneFrame(frameIdx) {
    return new Promise((resolve) => {
      if (this.cache[frameIdx]) { resolve(); return; }

      const t = frameIdx / this.fps;
      if (t >= this.video.duration) { resolve(); return; }

      // Use a temp canvas at full display size to capture the rendered frame
      const tmp = document.createElement('canvas');
      tmp.width = this.cw;
      tmp.height = this.ch;
      const tctx = tmp.getContext('2d', { alpha: false, willReadFrequently: true });

      const seeked = () => {
        this.video.removeEventListener('seeked', seeked);
        try {
          tctx.drawImage(this.video, this.dx, this.dy, this.dw, this.dh);
          this.cache[frameIdx] = tctx.getImageData(0, 0, this.cw, this.ch);
          this.totalCached++;
        } catch (e) {
          // Frame failed to capture
        }
        resolve();
      };

      this.video.addEventListener('seeked', seeked, { once: true });
      this.video.currentTime = t;
    });
  }

  // Cache ALL frames in background
  async _cacheAllFrames() {
    for (let i = 1; i < this.totalFrames; i++) {
      await this._cacheOneFrame(i);
      // Yield every frame so the UI stays responsive
      await new Promise(r => setTimeout(r, 0));
    }
  }

  scrollStarted() {
    if (this.currentFrame >= 0) {
      this._drawFrame();
    }
  }

  // Called when user scrolls back to top
  scrollBack() {
    this.currentFrame = -1;
    this.canvas.classList.remove('visible');
  }

  _onScroll() {
    if (!this.ready) return;

    const rect = this.section.getBoundingClientRect();
    const total = this.section.offsetHeight - window.innerHeight;
    if (total <= 0) return;

    const progress = Math.min(1, Math.max(0, -rect.top / total));
    const frame = Math.min(this.totalFrames - 1, Math.floor(progress * this.totalFrames));

    if (frame !== this.currentFrame) {
      this.currentFrame = frame;
      this._drawFrame();
    }

    if (this.progressBar) this.progressBar.style.height = (progress * 100) + '%';
    if (this.progressPct) this.progressPct.textContent = Math.round(progress * 100) + '%';

    this._updateText(progress);
  }

  _drawFrame() {
    const data = this.cache[this.currentFrame];
    if (data && this.ctx) {
      this.ctx.putImageData(data, 0, 0);
    } else if (this.ctx) {
      // Frame not cached yet — draw directly from video
      try {
        this.ctx.drawImage(this.video, this.dx, this.dy, this.dw, this.dh);
      } catch {}
    }
  }

  _updateText(progress) {
    let idx = -1;
    for (let i = 0; i < this.phases.length; i++) {
      if (progress >= this.phases[i].start && progress < this.phases[i].end) { idx = i; break; }
    }
    if (idx === this.lastTextPhase) return;

    document.querySelectorAll('.scroll-text-label, .scroll-text-title, .scroll-text-desc').forEach(el => el.classList.remove('visible'));
    this.lastTextPhase = idx;
    if (idx < 0) return;

    const p = this.phases[idx];
    const le = document.querySelector('.scroll-text-label');
    const te = document.querySelector('.scroll-text-title');
    const de = document.querySelector('.scroll-text-desc');

    if (le) { le.classList.remove('visible'); le.textContent = p.label; requestAnimationFrame(() => requestAnimationFrame(() => le.classList.add('visible'))); }
    if (te) { te.classList.remove('visible'); te.innerHTML = p.title; requestAnimationFrame(() => requestAnimationFrame(() => te.classList.add('visible'))); }
    if (de) { de.classList.remove('visible'); de.textContent = p.desc; requestAnimationFrame(() => requestAnimationFrame(() => de.classList.add('visible'))); }
  }

  destroy() {
    if (this.video) { this.video.pause(); this.video.src = ''; }
    if (this.canvas) this.canvas.remove();
  }
}
