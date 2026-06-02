/* ==========================================================================
   HoverMaskHero — Full-screen image with circular mask reveal on hover
   Canvas-based for performance. Stops completely on scroll.
   Mobile uses 9:16 ratio images, desktop uses 16:9.
   With fullscreen gyro overlay for permission + ripple dismiss.
   ========================================================================== */

class HoverMaskHero {
  constructor(container) {
    this.container = container;
    this.canvas = document.getElementById('hero-mask-canvas');
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.isMobile = window.innerWidth < 768;
    this.frontImg = document.querySelector(this.isMobile ? '.hero-img-front-mobile' : '.hero-img-front');
    this.backImg = document.querySelector(this.isMobile ? '.hero-img-back-mobile' : '.hero-img-back');

    this.mx = -999;
    this.my = -999;
    this.cx = -999;
    this.cy = -999;
    this.radius = 0;
    this.targetRadius = 0;
    this.active = false;
    this.maxRadius = this.isMobile ? 200 : 140;
    this.minRadius = 60;
    this.loaded = 0;
    this.ready = false;
    this.paused = false;
    this.gyroActive = false;
    this.dismissTimer = null;

    this._boundMove = (e) => this._onMove(e);
    this._boundEnter = () => this._onEnter();
    this._boundLeave = () => this._onLeave();
    this._boundTouch = (e) => this._onTouch(e);

    if (this.isMobile) {
      this._createGyroOverlay();
    }

    this._loadImages();
  }

  _loadImages() {
    let loaded = 0;
    const check = () => {
      loaded++;
      if (loaded >= 2) {
        this.ready = true;
        this._setup();
      }
    };
    if (this.frontImg && this.frontImg.complete) check(); else if (this.frontImg) this.frontImg.onload = check;
    if (this.backImg && this.backImg.complete) check(); else if (this.backImg) this.backImg.onload = check;
  }

  /* ----- Gyro overlay (fullscreen, forces tap) ----- */
  _createGyroOverlay() {
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

    // Activate on button click or overlay tap
    const activate = () => {
      this._requestGyroPermission();
      this._dismissOverlay(overlay);
    };

    const btn = document.getElementById('gyro-activate-btn');
    if (btn) btn.addEventListener('click', activate, { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.gyro-overlay-content')) {
        if (!this.gyroActive) activate();
      }
    }, { once: true });

    // Prevent hero scroll from triggering while overlay is shown
    overlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  _dismissOverlay(overlay) {
    overlay.classList.add('gyro-fade-out');
    setTimeout(() => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 500);
  }

  _requestGyroPermission() {
    if (this.gyroActive) return;
    this.gyroActive = true;

    this.gammaRef = 0;
    this.betaRef = 0;
    this.gyroCalibrated = false;

    // Activate mask
    this.active = true;
    this.targetRadius = this.maxRadius;

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
      const cx = rect.width / 2 + gamma * 8;
      const cy = rect.height / 2 + beta * 8;
      this.mx = Math.max(0, Math.min(rect.width, cx));
      this.my = Math.max(0, Math.min(rect.height, cy));

      // Reset dismiss timer on tilt
      this._resetDismissTimer();
    };

    // iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then((state) => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', this.gyroHandler, { passive: true });
        }
      }).catch(() => {});
    } else {
      window.addEventListener('deviceorientation', this.gyroHandler, { passive: true });
    }
  }

  /* ----- Ripple dismiss 0.7s after last action ----- */
  _resetDismissTimer() {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = setTimeout(() => {
      this._rippleDismiss();
    }, 700);
  }

  _rippleDismiss() {
    // Save current mask position for the ripple
    const sx = this.cx;
    const sy = this.cy;
    const startRadius = this.radius;

    // Animate radius shrinking to 0 with ease-out
    const duration = 400;
    const start = performance.now();
    const animate = (now) => {
      const t = Math.min((now - start) / duration, 1);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);
      this.radius = startRadius * (1 - ease);
      // Keep position fixed during ripple
      this.cx = sx;
      this.cy = sy;
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.radius = 0;
        this.active = false;
        this.targetRadius = 0;
      }
    };
    requestAnimationFrame(animate);
  }

  /* ----- Touch events (also trigger dismiss) ----- */
  _onTouch(e) {
    if (this.paused || !this.gyroActive) return;
    const touch = e.touches[0];
    if (!touch) return;
    const rect = this.container.getBoundingClientRect();
    this.mx = touch.clientX - rect.left;
    this.my = touch.clientY - rect.top;
    // Show mask at touch position
    this.active = true;
    this.targetRadius = this.maxRadius;
    this._resetDismissTimer();
  }

  _setup() {
    this._size();
    this._drawStatic();

    this.container.addEventListener('mousemove', this._boundMove, { passive: true });
    this.container.addEventListener('mouseenter', this._boundEnter, { passive: true });
    this.container.addEventListener('mouseleave', this._boundLeave, { passive: true });

    if (this.isMobile) {
      this.container.addEventListener('touchstart', this._boundTouch, { passive: true });
    }

    this._loop();
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
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 768;
    if (wasMobile !== this.isMobile) {
      this.frontImg = document.querySelector(this.isMobile ? '.hero-img-front-mobile' : '.hero-img-front');
      this.backImg = document.querySelector(this.isMobile ? '.hero-img-back-mobile' : '.hero-img-back');
    }
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

  _drawStatic() {
    if (this.paused) return;
    this.ctx.drawImage(this.frontImg, 0, 0, this.cw, this.ch);
  }

  _onMove(e) {
    if (this.paused) return;
    const rect = this.container.getBoundingClientRect();
    this.mx = e.clientX - rect.left;
    this.my = e.clientY - rect.top;
  }

  _onEnter() {
    if (this.paused) return;
    this.active = true;
    this.targetRadius = this.maxRadius;
  }

  _onLeave() {
    if (this.paused) return;
    if (this.isMobile) return;
    this.active = false;
    this.targetRadius = 0;
  }

  _loop() {
    if (this.paused) return;
    requestAnimationFrame(() => this._loop());

    if (this.container.getBoundingClientRect().bottom < 0) return;

    this.cx += (this.mx - this.cx) * 0.15;
    this.cy += (this.my - this.cy) * 0.15;

    // For mobile: radius is controlled by ripple, not lerp (only lerp up)
    if (!this.isMobile) {
      this.radius += (this.targetRadius - this.radius) * 0.12;
    } else if (this.active && this.radius < this.targetRadius) {
      this.radius += (this.targetRadius - this.radius) * 0.15;
    }

    if (Math.abs(this.radius) < 0.5 && !this.active) return;

    this._draw();
  }

  _draw() {
    if (this.paused) return;
    const ctx = this.ctx;
    const r = this.radius;

    ctx.clearRect(0, 0, this.cw, this.ch);
    ctx.drawImage(this.frontImg, 0, 0, this.cw, this.ch);

    if (r > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      ctx.clip();

      ctx.drawImage(this.backImg, 0, 0, this.cw, this.ch);

      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
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
