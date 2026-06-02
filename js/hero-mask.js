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
    this.maxRadius = 140;
    this.minRadius = 60;
    this.loaded = 0;
    this.ready = false;
    this.paused = false; // true when scroll hides hero

    this._boundMove = (e) => this._onMove(e);
    this._boundEnter = () => this._onEnter();
    this._boundLeave = () => this._onLeave();

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
