/* ==========================================================================
   HoverMaskHero — Full-screen image with circular mask reveal on hover
   Canvas-based for performance. Stops completely on scroll.
   Mobile uses 9:16 ratio images, desktop uses 16:9.
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
    this.paused = false; // true when scroll hides hero

    this._boundMove = (e) => this._onMove(e);
    this._boundEnter = () => this._onEnter();
    this._boundLeave = () => this._onLeave();

    // Mobile: use gyroscope for tilt-based mask position
    if (this.isMobile) {
      this._initGyro();
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

  _initGyro() {
    this.gammaRef = 0;
    this.betaRef = 0;
    this.gyroCalibrated = false;

    // On mobile, activate the mask immediately
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
      const sensitivity = 8;
      const cx = rect.width / 2 + gamma * sensitivity;
      const cy = rect.height / 2 + beta * sensitivity;
      this.mx = Math.max(0, Math.min(rect.width, cx));
      this.my = Math.max(0, Math.min(rect.height, cy));
    };

    // Show tap hint, then request permission on any touch
    this._showGyroHint();

    const attachHandler = () => {
      window.addEventListener('deviceorientation', this.gyroHandler, { passive: true });
    };

    // Try to attach on first touch, regardless of platform
    const onFirstTouch = () => {
      document.removeEventListener('touchstart', onFirstTouch);

      // iOS 13+ needs explicit permission API
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then((state) => {
          if (state === 'granted') attachHandler();
        }).catch(() => {
          // Fallback: just try anyway
          attachHandler();
        });
      } else {
        // Android / others: try directly (will work if permission is granted by browser)
        attachHandler();
      }
    };

    document.addEventListener('touchstart', onFirstTouch, { once: true, passive: true });
  }

  _showGyroHint() {
    const hint = document.createElement('div');
    hint.id = 'gyro-hint';
    hint.textContent = 'Tap to activate tilt';
    hint.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);z-index:50;background:rgba(0,0,0,0.75);color:white;padding:10px 20px;border-radius:4px;font-size:12px;letter-spacing:0.1em;font-family:"Hanken Grotesk",sans-serif;opacity:1;transition:opacity 0.6s;pointer-events:none;';
    document.body.appendChild(hint);

    // Remove hint on first touch
    const remove = () => {
      hint.style.opacity = '0';
      setTimeout(() => { if (hint.parentNode) hint.parentNode.removeChild(hint); }, 600);
      document.removeEventListener('touchstart', remove);
    };
    document.addEventListener('touchstart', remove, { once: true, passive: true });
  }

  _setup() {
    this._size();
    this._drawStatic();

    this.container.addEventListener('mousemove', this._boundMove, { passive: true });
    this.container.addEventListener('mouseenter', this._boundEnter, { passive: true });
    this.container.addEventListener('mouseleave', this._boundLeave, { passive: true });

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
    // Check if mobile/desktop changed
    const wasMobile = this.isMobile;
    this.isMobile = window.innerWidth < 768;
    if (wasMobile !== this.isMobile) {
      this.frontImg = document.querySelector(this.isMobile ? '.hero-img-front-mobile' : '.hero-img-front');
      this.backImg = document.querySelector(this.isMobile ? '.hero-img-back-mobile' : '.hero-img-back');
    }
    this._size();
    this._drawStatic();
  }

  // Pause mask (scroll active)
  pause() {
    this.paused = true;
    this.active = false;
  }

  // Resume mask (back at top)
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
    // On mobile the gyroscope keeps it active
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
    this.radius += (this.targetRadius - this.radius) * 0.12;

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
  }
}
