/* ==========================================================================
   HoverMaskHero — Full-screen video + particle reveal mask
   Desktop: images (unchanged). Mobile: videos + gyro + tap.
   Particles swarm to reveal back image, scatter on dismiss.
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
    this.gyroActive = false;
    this.gyroFrozen = false;
    this.dismissTimer = null;
    this.ready = false;
    this.paused = false;

    // Video loop crossfade
    this.videoOpacity = 1;
    this.videoFading = false;

    // ---- Particle system ----
    this.particles = [];
    this.particleTarget = { x: -999, y: -999 };
    this.particleRadius = 100; // radius of the reveal area
    this.particleActive = false;
    this.particleCount = 350;
    this.particleScattering = false;
    this.particleSettled = false;

    // Offscreen canvas for the back image snapshot
    this.backCanvas = null;
    this.backCtx = null;
    this.backSnapshotNeeded = true;

    // Store back image data per-pixel position for fast lookup
    this.backImageData = null;

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
      if (loaded >= 2) { this.ready = true; this._initParticles(); this._setup(); }
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

  /* ---- Particle initialization ---- */
  _initParticles() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      // Random starting position across the canvas
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * Math.max(this.cw, this.ch);
      this.particles.push({
        x: this.cw / 2 + Math.cos(angle) * dist,
        y: this.ch / 2 + Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        size: 2 + Math.random() * 4,
        baseSize: 2 + Math.random() * 4,
        // Scatter destination (when dismissing)
        scatterX: this.cw / 2 + Math.cos(angle) * dist * 0.5,
        scatterY: this.ch / 2 + Math.sin(angle) * dist * 0.5,
        // Target offset from center (for organic spread)
        offsetX: (Math.random() - 0.5) * this.particleRadius * 1.2,
        offsetY: (Math.random() - 0.5) * this.particleRadius * 1.2,
        // Settled position within the reveal area
        homeX: 0,
        homeY: 0,
        speed: 0.03 + Math.random() * 0.04,
        phase: Math.random() * Math.PI * 2,
        opacity: 0.6 + Math.random() * 0.4,
      });
    }
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
    this._activateParticles(this.cw / 2, this.ch / 2);
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
      const tx = Math.max(0, Math.min(rect.width, rect.width / 2 + gamma * 15));
      const ty = Math.max(0, Math.min(rect.height, rect.height / 2 + beta * 15));
      this._moveParticleTarget(tx, ty);
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

  /* ---- Particle control ---- */
  _activateParticles(x, y) {
    this.particleActive = true;
    this.particleScattering = false;
    this.particleTarget.x = x;
    this.particleTarget.y = y;
    this.particleSettled = false;

    // Assign each particle a home position near the target
    for (const p of this.particles) {
      p.homeX = x + p.offsetX;
      p.homeY = y + p.offsetY;
    }
  }

  _moveParticleTarget(x, y) {
    this.particleTarget.x = x;
    this.particleTarget.y = y;
    this.particleSettled = false;

    // Update home positions
    for (const p of this.particles) {
      p.homeX = x + p.offsetX;
      p.homeY = y + p.offsetY;
    }
  }

  _scatterParticles() {
    this.particleActive = false;
    this.particleScattering = true;
    this.particleSettled = false;

    // Give each particle a random scatter velocity
    for (const p of this.particles) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
    }

    // Stop scattering after animation completes
    setTimeout(() => {
      this.particleScattering = false;
      this.gyroFrozen = false;
    }, 1200);
  }

  /* ---- Dismiss after 1.5s ---- */
  _scheduleDismiss() {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => { this._scatterParticles(); }, 1500);
  }

  /* ---- Touch ---- */
  _onTouch(e) {
    if (this.paused || !this.gyroActive) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = this.container.getBoundingClientRect();
    const tx = touch.clientX - rect.left;
    const ty = touch.clientY - rect.top;
    this.gyroFrozen = true;
    this._activateParticles(tx, ty);
    this._scheduleDismiss();
  }

  /* ---- Mouse ---- */
  _onMove(e) {
    if (this.paused) return;
    const rect = this.container.getBoundingClientRect();
    this.mx = e.clientX - rect.left;
    this.my = e.clientY - rect.top;
  }

  _onEnter() {
    if (this.paused) return;
    this._activateParticles(this.mx > 0 ? this.mx : this.cw / 2, this.my > 0 ? this.my : this.ch / 2);
  }

  _onLeave() {
    if (this.paused) return;
    if (this.useVideo) return;
    this._scatterParticles();
  }

  _size() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.cw = w;
    this.ch = h;
    this.backSnapshotNeeded = true;
  }

  resize() {
    if (!this.ready || this.paused) return;
    this._size();
    this._drawStatic();
  }

  pause() {
    this.paused = true;
    this.particleActive = false;
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

    // Video loop crossfade
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

    this._updateParticles();
    this._draw();
  }

  _updateParticles() {
    const dt = 1;

    for (const p of this.particles) {
      if (this.particleActive) {
        // Swarm toward home position with spring physics
        const dx = p.homeX - p.x;
        const dy = p.homeY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1) {
          // Ease toward target
          p.vx += dx * 0.08 * dt;
          p.vy += dy * 0.08 * dt;
        }

        // Damping
        p.vx *= 0.85;
        p.vy *= 0.85;

        p.x += p.vx;
        p.y += p.vy;

        // Slight wobble for organic feel
        p.x += Math.sin(performance.now() * 0.002 + p.phase) * 0.3;
        p.y += Math.cos(performance.now() * 0.002 + p.phase) * 0.3;
      } else if (this.particleScattering) {
        // Scatter outward
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.x += p.vx;
        p.y += p.vy;
      }
    }
  }

  _draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cw, this.ch);
    const frontSrc = this._getFrontSource();
    const backSrc = this._getBackSource();
    const isActive = this.particleActive || this.particleScattering;
    const videosAlpha = this.useVideo && this.videoOpacity < 1 ? this.videoOpacity : 1;

    if (videosAlpha < 1) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.cw, this.ch);
    }

    if (!isActive) {
      ctx.globalAlpha = videosAlpha;
      ctx.drawImage(frontSrc, 0, 0, this.cw, this.ch);
      ctx.globalAlpha = 1;
      return;
    }

    // ---- Particle reveal: front with holes, back visible through holes ----
    // 1. Draw front image
    ctx.drawImage(frontSrc, 0, 0, this.cw, this.ch);

    // 2. Cut holes in front where particles cluster (destination-out removes front)
    ctx.globalCompositeOperation = 'destination-out';
    for (const p of this.particles) {
      const dist = Math.sqrt((p.x - this.particleTarget.x) ** 2 + (p.y - this.particleTarget.y) ** 2);
      const maxDist = this.particleRadius * 2.5;
      if (dist < maxDist) {
        const size = p.size * (1 - dist / maxDist * 0.3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(size, 1.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Draw back image BEHIND front (shows through the holes)
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(backSrc, 0, 0, this.cw, this.ch);
    ctx.globalCompositeOperation = 'source-over';

    // Subtle glow at the reveal center
    const grd = ctx.createRadialGradient(
      this.particleTarget.x, this.particleTarget.y, 0,
      this.particleTarget.x, this.particleTarget.y, this.particleRadius * 0.6
    );
    grd.addColorStop(0, 'rgba(188,0,45,0.06)');
    grd.addColorStop(1, 'rgba(188,0,45,0)');
    ctx.fillStyle = grd;
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
