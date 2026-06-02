/* ==========================================================================
   HoverMaskHero — Full-screen video + mask reveal
   Canvas composites two videos: front (base) + back (reveal via circle mask).
   Desktop: images (unchanged). Mobile: videos + gyro + tap + auto-ripple.
   ========================================================================== */

class HoverMaskHero {
  constructor(container) {
    this.container = container;
    this.canvas = document.getElementById('hero-mask-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.isMobile = window.innerWidth < 768;

    // Desktop uses images, mobile uses videos
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
    this.rippleAnim = null;
    this.ready = false;
    this.paused = false;

    // Mobile: smaller mask for tilt, slightly larger for tap
    this.tiltRadius = 80;
    this.tapRadius = 130;

    this._boundMove = (e) => this._onMove(e);
    this._boundEnter = () => this._onEnter();
    this._boundLeave = () => this._onLeave();
    this._boundTouch = (e) => this._onTouch(e);

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

    let frontReady = false;
    let backReady = false;

    // Use mobile poster images as canvas background until videos are ready
    this.fallbackFront = document.querySelector('.hero-img-front-mobile');
    this.fallbackBack = document.querySelector('.hero-img-back-mobile');

    // Fire setup early so canvas starts drawing fallback images
    setTimeout(() => {
      if (!this.ready) {
        this._setup(); // Start the loop with fallback images
      }
    }, 100);

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

    // Safety timeout: if videos take >5s, fall back to mobile images
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

    if (this.useVideo) {
      this.container.addEventListener('touchstart', this._boundTouch, { passive: true });
    }

    this._loop();
  }

  /* ---- Gyro overlay (mobile only) ---- */
  _createGyroOverlay() {
    if (!this.useVideo) return;
    const overlay = document.createElement('div');
    overlay.id = 'gyro-overlay';
    overlay.innerHTML = `
      <div class="gyro-overlay-bg"></div>
      <div class="gyro-overlay-content">
        <div class="gyro-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
            <circle cx="24" cy="24" r="6" fill="rgba(188,0,45,0.8)"/>
            <line x1="24" y1="4" x2="24" y2="14" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="2 2"/>
            <line x1="44" y1="24" x2="34" y2="24" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="2 2"/>
            <line x1="24" y1="44" x2="24" y2="34" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="2 2"/>
            <line x1="4" y1="24" x2="14" y2="24" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="2 2"/>
          </svg>
        </div>
        <p class="gyro-title">Tilt to Reveal</p>
        <p class="gyro-sub">Tap anywhere to activate<br>phone tilt control</p>
        <button class="gyro-btn" id="gyro-activate-btn">ACTIVATE TILT</button>
      </div>
    `;
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

    // Also start playing front/back videos after overlay dismissed
    if (this.frontVideo) this.frontVideo.play().catch(() => {});
    if (this.backVideo) this.backVideo.play().catch(() => {});
  }

  _requestGyro() {
    if (this.gyroActive) return;
    this.gyroActive = true;

    this.gammaRef = 0;
    this.betaRef = 0;
    this.gyroCalibrated = false;
    this._activateMask(this.tiltRadius);
    this._scheduleDismiss();

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
      const cx = rect.width / 2 + gamma * 10;
      const cy = rect.height / 2 + beta * 10;
      this.mx = Math.max(0, Math.min(rect.width, cx));
      this.my = Math.max(0, Math.min(rect.height, cy));

      // Every tilt resets the 1.5s dismiss timer
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

  _resetDismiss() {
    if (this.rippleAnim) { cancelAnimationFrame(this.rippleAnim); this.rippleAnim = null; }
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this._scheduleDismiss();
  }

  /* ---- Mask activation ---- */
  _activateMask(radius) {
    this.active = true;
    this.targetRadius = radius;
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    if (this.rippleAnim) { cancelAnimationFrame(this.rippleAnim); this.rippleAnim = null; }
  }

  /* ---- Ripple dismiss after 1.5s ---- */
  _scheduleDismiss() {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => {
      this._rippleDismiss();
    }, 1500);
  }

  _rippleDismiss() {
    const sx = this.cx;
    const sy = this.cy;
    const startR = this.radius;
    const duration = 500;
    const start = performance.now();

    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      this.radius = startR * (1 - ease);
      this.cx = sx;
      this.cy = sy;
      if (t < 1) {
        this.rippleAnim = requestAnimationFrame(animate);
      } else {
        this.radius = 0;
        this.active = false;
        this.targetRadius = 0;
        this.rippleAnim = null;
      }
    };
    this.rippleAnim = requestAnimationFrame(animate);
  }

  /* ---- Touch events ---- */
  _onTouch(e) {
    if (this.paused || !this.gyroActive) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = this.container.getBoundingClientRect();
    this.mx = touch.clientX - rect.left;
    this.my = touch.clientY - rect.top;
    this._activateMask(this.tapRadius);
    this._scheduleDismiss();
  }

  /* ---- Mouse events (desktop) ---- */
  _onMove(e) {
    if (this.paused) return;
    const rect = this.container.getBoundingClientRect();
    this.mx = e.clientX - rect.left;
    this.my = e.clientY - rect.top;
  }

  _onEnter() {
    if (this.paused) return;
    this._activateMask(140);
  }

  _onLeave() {
    if (this.paused) return;
    if (this.useVideo) return;
    this.active = false;
    this.targetRadius = 0;
  }

  /* ---- Sizing ---- */
  _size() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.cw = w;
    this.ch = h;
  }

  resize() {
    if (!this.ready || this.paused) return;
    this._size();
    this._drawStatic();
  }

  pause() {
    this.paused = true;
    this.active = false;
  }

  resume() {
    if (!this.ready) return;
    this.paused = false;
    this._size();
    this._drawStatic();
    this._loop();
  }

  _getFrontSource() {
    if (this.useVideo && this.frontVideo && this.frontVideo.readyState >= 2) return this.frontVideo;
    if (this.fallbackFront) return this.fallbackFront;
    return this.frontImg;
  }

  _getBackSource() {
    if (this.useVideo && this.backVideo && this.backVideo.readyState >= 2) return this.backVideo;
    if (this.fallbackBack) return this.fallbackBack;
    return this.backImg;
  }

  _drawStatic() {
    if (this.paused) return;
    this.ctx.drawImage(this._getFrontSource(), 0, 0, this.cw, this.ch);
  }

  /* ---- Main loop ---- */
  _loop() {
    requestAnimationFrame(() => this._loop());

    if (this.paused || !this.ready) return;
    if (this.container.getBoundingClientRect().bottom < 0) return;

    // Smooth lerp position
    this.cx += (this.mx - this.cx) * 0.18;
    this.cy += (this.my - this.cy) * 0.18;

    // Smooth radius lerp (only lerp up; ripple controls the down)
    if (this.active && this.radius < this.targetRadius) {
      this.radius += (this.targetRadius - this.radius) * 0.15;
    }

    if (Math.abs(this.radius) < 0.5 && !this.active) return;

    this._draw();
  }

  _draw() {
    const ctx = this.ctx;
    const r = this.radius;

    ctx.clearRect(0, 0, this.cw, this.ch);

    // Front layer (always visible) — fallbacks gracefully from video → mobile img → desktop img
    ctx.drawImage(this._getFrontSource(), 0, 0, this.cw, this.ch);

    // Back layer through circle mask
    if (r > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.clip();

      ctx.drawImage(this._getBackSource(), 0, 0, this.cw, this.ch);

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
    this.container.removeEventListener('touchstart', this._boundTouch);
  }
}
