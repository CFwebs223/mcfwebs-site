/* ==========================================================================
   HoverMaskHero — Desktop: circle mask (images), Mobile: particle reveal (videos)
   ========================================================================== */

class HoverMaskHero {
  constructor(container) {
    this.container = container;
    this.canvas = document.getElementById('hero-mask-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.isMobile = window.innerWidth < 768;
    this.useVideo = this.isMobile;

    // Desktop: circle mask
    this.mx = -999;
    this.my = -999;
    this.cx = -999;
    this.cy = -999;
    this.radius = 0;
    this.targetRadius = 0;
    this.active = false;
    this.mouseOnCanvas = false;

    // Mobile: gyro + particle
    this.gyroActive = false;
    this.gyroFrozen = false;
    this.dismissTimer = null;
    this.ready = false;
    this.paused = false;

    // Video loop crossfade
    this.videoOpacity = 1;
    this.videoFading = false;

    // Particles (mobile only)
    this.particles = [];
    this.pActive = false;
    this.pScattering = false;
    this.pTargetX = 0;
    this.pTargetY = 0;
    this.pRadius = 80;
    this.pCount = 250;

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

    let frontReady = false, backReady = false;
    this.fallbackFront = document.querySelector('.hero-img-front-mobile');
    this.fallbackBack = document.querySelector('.hero-img-back-mobile');

    setTimeout(() => { if (!this.ready) this._setup(); }, 100);

    const bothReady = () => {
      if (!frontReady || !backReady) return;
      this.ready = true;
      this.frontVideo.play().catch(() => {});
      this.backVideo.play().catch(() => {});
      this._initParticles();
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

  /* ---- Particles (mobile only) ---- */
  _initParticles() {
    this.particles = [];
    for (let i = 0; i < this.pCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 100 + Math.random() * Math.max(this.cw, this.ch);
      this.particles.push({
        x: this.cw / 2 + Math.cos(a) * d,
        y: this.ch / 2 + Math.sin(a) * d,
        vx: 0, vy: 0,
        sz: 3 + Math.random() * 5,
        ox: (Math.random() - 0.5) * this.pRadius * 1.5,
        oy: (Math.random() - 0.5) * this.pRadius * 1.5,
        hx: 0, hy: 0,
        ph: Math.random() * Math.PI * 2,
        op: 0.5 + Math.random() * 0.5,
      });
    }
  }

  _activateP(x, y) {
    this.pActive = true;
    this.pScattering = false;
    this.pTargetX = x;
    this.pTargetY = y;
    for (const p of this.particles) {
      p.hx = x + p.ox;
      p.hy = y + p.oy;
    }
  }

  _moveP(x, y) {
    this.pTargetX = x;
    this.pTargetY = y;
    for (const p of this.particles) {
      p.hx = x + p.ox;
      p.hy = y + p.oy;
    }
  }

  _scatterP() {
    this.pActive = false;
    this.pScattering = true;
    for (const p of this.particles) {
      const a = Math.random() * Math.PI * 2;
      const s = 2 + Math.random() * 8;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
    }
    setTimeout(() => {
      this.pScattering = false;
      this.gyroFrozen = false;
    }, 1000);
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
    this._activateP(this.cw / 2, this.ch / 2);
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
      this._moveP(
        Math.max(0, Math.min(rect.width, rect.width / 2 + gamma * 15)),
        Math.max(0, Math.min(rect.height, rect.height / 2 + beta * 15))
      );
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

  _resetDismiss() { if (this.dismissTimer) clearTimeout(this.dismissTimer); this._scheduleDismiss(); }
  _scheduleDismiss() { this.dismissTimer = setTimeout(() => { this._scatterP(); }, 1500); }

  /* ---- Touch ---- */
  _onTouch(e) {
    if (this.paused || !this.gyroActive) return;
    const t = e.touches[0];
    if (!t) return;
    const r = this.container.getBoundingClientRect();
    this.gyroFrozen = true;
    this._activateP(t.clientX - r.left, t.clientY - r.top);
    this._scheduleDismiss();
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
    this.mouseOnCanvas = true;
    this.active = true;
    this.targetRadius = 120;
  }

  _onLeave() {
    if (this.paused) return;
    this.mouseOnCanvas = false;
    this.active = false;
    this.targetRadius = 0;
  }

  _size() {
    this.cw = this.canvas.width = this.container.clientWidth;
    this.ch = this.canvas.height = this.container.clientHeight;
  }

  resize() { if (!this.ready || this.paused) return; this._size(); this._drawStatic(); }
  pause() { this.paused = true; this.active = false; this.pActive = false; }

  resume() {
    if (!this.ready) return;
    this.paused = false;
    this._size();
    this._drawStatic();
    this._loop();
  }

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

    // Video loop crossfade
    if (this.useVideo && this.frontVideo && this.backVideo) {
      const dur = this.frontVideo.duration;
      const ct = this.frontVideo.currentTime;
      const fd = 0.4;
      if (dur > 0 && ct > dur - fd) { this.videoOpacity = Math.max(0, (dur - ct) / fd); this.videoFading = true; }
      else if (ct < fd && this.videoFading) { this.videoOpacity = Math.min(1, ct / fd); }
      else if (ct >= fd) { this.videoOpacity = 1; this.videoFading = false; }
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cw, this.ch);

    if (this.useVideo && this.videoOpacity < 1) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.cw, this.ch);
      ctx.globalAlpha = this.videoOpacity;
    }

    if (!this.useVideo) {
      // ======== DESKTOP: circle mask (images) ========
      const src = this._getFront();
      const back = this._getBack();
      ctx.drawImage(src, 0, 0, this.cw, this.ch);

      if (this.mouseOnCanvas) {
        this.cx += (this.mx - this.cx) * 0.15;
        this.cy += (this.my - this.cy) * 0.15;
      } else {
        this.cx = this.mx;
        this.cy = this.my;
      }
      this.radius += (this.targetRadius - this.radius) * 0.12;

      if (this.radius > 1 && this.active) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(back, 0, 0, this.cw, this.ch);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      return;
    }

    // ======== MOBILE: particle reveal (videos) ========
    const front = this._getFront();
    const back = this._getBack();

    const isActive = this.pActive || this.pScattering;

    // Update particles
    if (this.pActive) {
      for (const p of this.particles) {
        const dx = p.hx - p.x;
        const dy = p.hy - p.y;
        p.vx += dx * 0.1;
        p.vy += dy * 0.1;
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x += p.vx;
        p.y += p.vy;
        p.x += Math.sin(performance.now() * 0.003 + p.ph) * 0.3;
        p.y += Math.cos(performance.now() * 0.003 + p.ph) * 0.3;
      }
    } else if (this.pScattering) {
      for (const p of this.particles) {
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x += p.vx;
        p.y += p.vy;
      }
    }

    if (!isActive) {
      // Just draw front video
      ctx.drawImage(front, 0, 0, this.cw, this.ch);
      ctx.globalAlpha = 1;
      return;
    }

    // Draw front, then overlay back image at each particle position
    ctx.drawImage(front, 0, 0, this.cw, this.ch);

    // Draw back video clipped to each particle position
    // Use destination-out to remove particle-shaped holes from front,
    // then destination-over to place back underneath
    ctx.globalCompositeOperation = 'destination-out';
    for (const p of this.particles) {
      const d = Math.sqrt((p.x - this.pTargetX) ** 2 + (p.y - this.pTargetY) ** 2);
      const maxD = this.pRadius * 2.5;
      if (d < maxD) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz * (1 - d / maxD * 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(back, 0, 0, this.cw, this.ch);
    ctx.globalCompositeOperation = 'source-over';

    // Tiny glow
    const g = ctx.createRadialGradient(this.pTargetX, this.pTargetY, 0, this.pTargetX, this.pTargetY, this.pRadius * 0.5);
    g.addColorStop(0, 'rgba(188,0,45,0.05)');
    g.addColorStop(1, 'rgba(188,0,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.cw, this.ch);

    ctx.globalAlpha = 1;
  }

  destroy() {
    this.paused = true;
    this.container.removeEventListener('mousemove', this._boundMove);
    this.container.removeEventListener('mouseenter', this._boundEnter);
    this.container.removeEventListener('mouseleave', this._boundLeave);
    this.container.removeEventListener('touchstart', this._boundTouch);
  }
}
