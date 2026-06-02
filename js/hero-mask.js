/* ==========================================================================
   HoverMaskHero — Full-screen video + mask reveal
   Canvas composites two videos: front (base) + back (reveal via circle mask).
   Desktop: images (unchanged). Mobile: videos + gyro + tap + water ripple.
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

    // Video loop crossfade
    this.videoOpacity = 1;
    this.videoFading = false;

    // Tap freezes gyro
    this.gyroFrozen = false;

    // Water ripple effect
    this.ripples = [];

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

    this.fallbackFront = document.querySelector('.hero-img-front-mobile');
    this.fallbackBack = document.querySelector('.hero-img-back-mobile');

    setTimeout(() => {
      if (!this.ready) this._setup();
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
      if (this.gyroFrozen) return;
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
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this._scheduleDismiss();
  }

  _activateMask(radius) {
    this.active = true;
    this.targetRadius = radius;
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
  }

  /* ---- Water ripple dismiss after 1.5s ---- */
  _scheduleDismiss() {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => { this._waterRippleDismiss(); }, 1500);
  }

  _waterRippleDismiss() {
    this.active = false;
    this.targetRadius = 0;

    const cx = this.cx;
    const cy = this.cy;
    const maxR = Math.max(this.cw, this.ch);

    // Three expanding concentric rings
    for (let i = 0; i < 3; i++) {
      this.ripples.push({
        cx, cy,
        startRadius: Math.max(this.radius, 20),
        maxRadius: maxR,
        progress: i * 0.15, // stagger start
        speed: 0.008 + i * 0.002,
        maxOpacity: 0.5 - i * 0.12,
      });
    }

    // After ripple animation done, unfreeze gyro
    setTimeout(() => {
      this.gyroFrozen = false;
    }, 800);
  }

  /* ---- Touch events ---- */
  _onTouch(e) {
    if (this.paused || !this.gyroActive) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = this.container.getBoundingClientRect();
    this.mx = touch.clientX - rect.left;
    this.my = touch.clientY - rect.top;
    this.gyroFrozen = true;
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

    // ---- Video loop crossfade through black ----
    if (this.useVideo && this.frontVideo && this.backVideo) {
      const dur = this.frontVideo.duration;
      const ct = this.frontVideo.currentTime;
      const fadeDuration = 0.4;

      if (dur > 0 && ct > dur - fadeDuration) {
        this.videoOpacity = Math.max(0, (dur - ct) / fadeDuration);
        this.videoFading = true;
      } else if (ct < fadeDuration && this.videoFading) {
        this.videoOpacity = Math.min(1, ct / fadeDuration);
      } else if (ct >= fadeDuration) {
        this.videoOpacity = 1;
        this.videoFading = false;
      }
    }

    // Smooth lerp for mask position
    this.cx += (this.mx - this.cx) * 0.18;
    this.cy += (this.my - this.cy) * 0.18;

    // Radius lerp (only up — water ripple replaces the shrink)
    if (this.active && this.radius < this.targetRadius) {
      this.radius += (this.targetRadius - this.radius) * 0.15;
    }

    // Always draw — ensures videos keep updating even when mask is inactive
    this._draw();
  }

  _draw() {
    const ctx = this.ctx;
    const r = this.radius;

    ctx.clearRect(0, 0, this.cw, this.ch);

    // ---- Composite front video (always drawn, video keeps updating) ----
    if (this.useVideo && this.videoOpacity < 1) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.cw, this.ch);
      ctx.globalAlpha = this.videoOpacity;
      ctx.drawImage(this._getFrontSource(), 0, 0, this.cw, this.ch);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(this._getFrontSource(), 0, 0, this.cw, this.ch);
    }

    // ---- Active circle mask ----
    if (r > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.clip();

      if (this.useVideo && this.videoOpacity < 1) {
        ctx.globalAlpha = this.videoOpacity;
        ctx.drawImage(this._getBackSource(), 0, 0, this.cw, this.ch);
        ctx.globalAlpha = 1;
      } else {
        ctx.drawImage(this._getBackSource(), 0, 0, this.cw, this.ch);
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r - 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ---- Water ripple rings ----
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rip = this.ripples[i];
      rip.progress += rip.speed;

      if (rip.progress >= 1) {
        this.ripples.splice(i, 1);
        continue;
      }

      const currentR = rip.startRadius + (rip.maxRadius - rip.startRadius) * rip.progress;
      const opacity = rip.maxOpacity * (1 - rip.progress);

      ctx.beginPath();
      ctx.arc(rip.cx, rip.cy, currentR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
      ctx.lineWidth = 1.5 * (1 - rip.progress * 0.5);
      ctx.stroke();
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
