/* ==========================================================================
   HoverMaskHero — Desktop: circle mask (images). Mobile: tilt circle mask (videos).
   ========================================================================== */

class HoverMaskHero {
  constructor(container) {
    this.container = container;
    this.canvas = document.getElementById('hero-mask-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.isMobile = window.innerWidth < 768;
    this.useVideo = this.isMobile;

    this.mx = -999;
    this.my = -999;
    this.cx = -999;
    this.cy = -999;
    this.radius = 0;
    this.targetRadius = 0;
    this.active = false;
    this.gyroActive = false;
    this.dismissTimer = null;
    this.ready = false;
    this.paused = false;

    // Smoother video loop crossfade
    this.videoOpacity = 1;
    this.videoFading = false;

    this.tiltRadius = 100;

    this._boundMove = (e) => this._onMove(e);
    this._boundEnter = () => this._onEnter();
    this._boundLeave = () => this._onLeave();

    if (this.useVideo) {
      this._loadVideos();
    } else {
      this.frontImg = document.querySelector('.hero-img-front');
      this.backImg = document.querySelector('.hero-img-back');
      this._loadImages();
    }
  }

  /* ---- Desktop: images ---- */
  _loadImages() {
    let loaded = 0;
    const check = () => {
      loaded++;
      if (loaded >= 2) { this.ready = true; this._setup(); }
    };
    if (this.frontImg && this.frontImg.complete) check(); else if (this.frontImg) this.frontImg.onload = check;
    if (this.backImg && this.backImg.complete) check(); else if (this.backImg) this.backImg.onload = check;
  }

  /* ---- Mobile: videos ---- */
  _loadVideos() {
    this.frontVideo = document.createElement('video');
    this.frontVideo.muted = true;
    this.frontVideo.loop = true;
    this.frontVideo.playsInline = true;
    this.frontVideo.preload = 'auto';
    this.frontVideo.crossOrigin = 'anonymous';
    this.frontVideo.src = 'videos/hero-front-mobile.mp4';

    this.backVideo = document.createElement('video');
    this.backVideo.muted = true;
    this.backVideo.loop = true;
    this.backVideo.playsInline = true;
    this.backVideo.preload = 'auto';
    this.backVideo.crossOrigin = 'anonymous';
    this.backVideo.src = 'videos/hero-back-mobile.mp4';

    let frontReady = false, backReady = false;
    this.fallbackFront = document.querySelector('.hero-img-front-mobile');
    this.fallbackBack = document.querySelector('.hero-img-back-mobile');

    setTimeout(() => { if (!this.ready) this._setup(); }, 100);

    const bothReady = () => {
      if (!frontReady || !backReady) return;
      this.ready = true;
      this.frontVideo.play().catch(() => {});
      this.backVideo.play().catch(() => {});
      this._createGyroOverlay();
    };

    this.frontVideo.addEventListener('canplay', () => { frontReady = true; bothReady(); }, { once: true });
    this.backVideo.addEventListener('canplay', () => { backReady = true; bothReady(); }, { once: true });
    this.frontVideo.load();
    this.backVideo.load();

    setTimeout(() => {
      if (!this.ready) {
        this.useVideo = false;
        this.frontImg = document.querySelector('.hero-img-front-mobile');
        this.backImg = document.querySelector('.hero-img-back-mobile');
        this._loadImages();
      }
    }, 5000);
  }

  _setup() {
    this._size();
    this._drawStatic();
    this.container.addEventListener('mousemove', this._boundMove, { passive: true });
    this.container.addEventListener('mouseenter', this._boundEnter, { passive: true });
    this.container.addEventListener('mouseleave', this._boundLeave, { passive: true });
    this._loop();
  }

  /* ---- Gyro overlay ---- */
  _createGyroOverlay() {
    if (!this.useVideo) return;
    const overlay = document.createElement('div');
    overlay.id = 'gyro-overlay';
    overlay.innerHTML = `
      <div class="gyro-overlay-bg"></div>
      <div class="gyro-overlay-content">
        <div class="gyro-icon"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.3)" stroke-width="1"/><circle cx="24" cy="24" r="6" fill="rgba(188,0,45,0.8)"/><line x1="24" y1="4" x2="24" y2="14" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="2 2"/><line x1="44" y1="24" x2="34" y2="24" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="2 2"/><line x1="24" y1="44" x2="24" y2="34" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="2 2"/><line x1="4" y1="24" x2="14" y2="24" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="2 2"/></svg></div>
        <p class="gyro-title">Tilt to Reveal</p>
        <p class="gyro-sub">Tap anywhere to activate<br>phone tilt control</p>
        <button class="gyro-btn" id="gyro-activate-btn">ACTIVATE TILT</button>
      </div>`;
    document.body.appendChild(overlay);
    const activate = () => { this._requestGyro(); this._dismissOverlay(overlay); };
    const btn = document.getElementById('gyro-activate-btn');
    if (btn) btn.addEventListener('click', activate, { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.gyro-overlay-content')) {
        if (!this.gyroActive) activate();
      }
    }, { once: true });
  }

  _dismissOverlay(overlay) {
    overlay.classList.add('gyro-fade-out');
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 500);
    if (this.frontVideo) this.frontVideo.play().catch(() => {});
    if (this.backVideo) this.backVideo.play().catch(() => {});
  }

  _requestGyro() {
    if (this.gyroActive) return;
    this.gyroActive = true;
    this.gammaRef = 0;
    this.betaRef = 0;
    this.gyroCalibrated = false;
    this._activateCircle(this.tiltRadius);

    this.gyroHandler = (e) => {
      if (e.gamma === null || e.beta === null) return;
      if (!this.gyroCalibrated) {
        this.gammaRef = e.gamma;
        this.betaRef = e.beta;
        this.gyroCalibrated = true;
      }
      const gamma = e.gamma - this.gammaRef;
      const beta = e.beta - this.betaRef;
      const rect = this.container.getBoundingClientRect();
      this.mx = Math.max(0, Math.min(rect.width, rect.width / 2 + gamma * 15));
      this.my = Math.max(0, Math.min(rect.height, rect.height / 2 + beta * 15));
      this._resetDismiss();
    };

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then((state) => {
        if (state === 'granted') window.addEventListener('deviceorientation', this.gyroHandler, { passive: true });
      }).catch(() => {});
    } else {
      window.addEventListener('deviceorientation', this.gyroHandler, { passive: true });
    }
  }

  _activateCircle(r) {
    this.active = true;
    this.targetRadius = r;
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
  }

  _resetDismiss() { if (this.dismissTimer) clearTimeout(this.dismissTimer); this._scheduleDismiss(); }
  _scheduleDismiss() { this.dismissTimer = setTimeout(() => { this._shrinkCircle(); }, 2000); }

  _shrinkCircle() {
    this.active = false;
    this.targetRadius = 0;
  }

  /* ---- Mouse (desktop) ---- */
  _onMove(e) {
    if (this.paused) return;
    const r = this.container.getBoundingClientRect();
    this.mx = e.clientX - r.left;
    this.my = e.clientY - r.top;
  }

  _onEnter() {
    if (this.paused) return;
    this.active = true;
    this.targetRadius = 120;
  }

  _onLeave() {
    if (this.paused) return;
    if (this.useVideo) return;
    this.active = false;
    this.targetRadius = 0;
  }

  _size() {
    this.cw = this.canvas.width = this.container.clientWidth;
    this.ch = this.canvas.height = this.container.clientHeight;
  }

  resize() { if (!this.ready || this.paused) return; this._size(); this._drawStatic(); }
  pause() { this.paused = true; this.active = false; }
  resume() { if (!this.ready) return; this.paused = false; this._size(); this._drawStatic(); this._loop(); }

  _getFront() {
    if (this.useVideo && this.frontVideo && this.frontVideo.readyState >= 2) return this.frontVideo;
    if (this.fallbackFront) return this.fallbackFront;
    return this.frontImg;
  }

  _getBack() {
    if (this.useVideo && this.backVideo && this.backVideo.readyState >= 2) return this.backVideo;
    if (this.fallbackBack) return this.fallbackBack;
    return this.backImg;
  }

  _drawStatic() { if (this.paused) return; this.ctx.drawImage(this._getFront(), 0, 0, this.cw, this.ch); }

  /* ---- Main loop ---- */
  _loop() {
    requestAnimationFrame(() => this._loop());
    if (this.paused || !this.ready) return;
    if (this.container.getBoundingClientRect().bottom < 0) return;

    // ---- Smoother video loop crossfade ----
    if (this.useVideo && this.frontVideo && this.backVideo) {
      const dur = this.frontVideo.duration;
      const ct = this.frontVideo.currentTime;
      const fd = 0.6; // Longer fade = smoother

      if (dur > 0 && ct > dur - fd) {
        // Fade out over last 0.6s
        this.videoOpacity = Math.max(0, (dur - ct) / fd);
        this.videoFading = true;
      } else if (ct < fd * 0.5 && this.videoFading) {
        // Fade in over first 0.3s of new loop
        this.videoOpacity = Math.min(1, ct / (fd * 0.5));
        // After finishing fade-in, end the fading state
        if (this.videoOpacity >= 0.99) this.videoFading = false;
      } else if (ct >= fd * 0.5) {
        this.videoOpacity = 1;
        this.videoFading = false;
      }
    }

    // Smooth lerp
    this.cx += (this.mx - this.cx) * 0.18;
    this.cy += (this.my - this.cy) * 0.18;

    // Radius lerp (both directions)
    this.radius += (this.targetRadius - this.radius) * 0.12;

    this._draw();
  }

  _draw() {
    const ctx = this.ctx;
    const r = this.radius;

    ctx.clearRect(0, 0, this.cw, this.ch);

    // Front layer
    if (this.useVideo && this.videoOpacity < 1) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.cw, this.ch);
      ctx.globalAlpha = this.videoOpacity;
    }
    ctx.drawImage(this._getFront(), 0, 0, this.cw, this.ch);
    ctx.globalAlpha = 1;

    // Circle mask revealing back
    if (r > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.clip();

      if (this.useVideo && this.videoOpacity < 1) {
        ctx.globalAlpha = this.videoOpacity;
        ctx.drawImage(this._getBack(), 0, 0, this.cw, this.ch);
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(this._getBack(), 0, 0, this.cw, this.ch);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  destroy() {
    this.paused = true;
    this.container.removeEventListener('mousemove', this._boundMove);
    this.container.removeEventListener('mouseenter', this._boundEnter);
    this.container.removeEventListener('mouseleave', this._boundLeave);
  }
}
