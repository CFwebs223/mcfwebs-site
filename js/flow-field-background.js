/* ==========================================================================
   Flow-field background — generative ink-on-paper canvas for the
   "What We Build" section. Ported from a React/canvas reference into
   vanilla JS and retuned to the site's paper/ink/crimson palette
   (was indigo-on-black).
   ========================================================================== */

(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.getElementById('flow-field-canvas');
  const container = canvas ? canvas.parentElement : null;
  if (!canvas || !container) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // --- Palette (from css/style.css :root) ---
  // Matches --paper exactly (not --paper-warm) so the wash this canvas
  // settles into is identical to the flat background of the section
  // that follows it — no visible seam at the full-bleed edge.
  const TRAIL_COLOR = '250, 250, 249'; // --paper, as an rgb fade
  const TRAIL_OPACITY = 0.1;
  const PARTICLE_COLORS = ['#bc002d', '#1a1a1a']; // --crimson, --ink
  const PARTICLE_COLOR_WEIGHTS = [0.35, 0.65]; // ~35% crimson, ~65% ink
  const PARTICLE_COUNT = 500;
  const SPEED = 0.7;

  let width = container.clientWidth;
  let height = container.clientHeight;
  let particles = [];
  let animationFrameId = null;
  let running = false;
  const mouse = { x: -1000, y: -1000 };

  function pickColor() {
    const r = Math.random();
    return r < PARTICLE_COLOR_WEIGHTS[0] ? PARTICLE_COLORS[0] : PARTICLE_COLORS[1];
  }

  class Particle {
    constructor() {
      this.color = pickColor();
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = 0;
      this.vy = 0;
      this.age = 0;
      this.life = Math.random() * 200 + 100;
    }

    update() {
      const angle = (Math.cos(this.x * 0.005) + Math.sin(this.y * 0.005)) * Math.PI;

      this.vx += Math.cos(angle) * 0.2 * SPEED;
      this.vy += Math.sin(angle) * 0.2 * SPEED;

      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const interactionRadius = 130;

      if (distance < interactionRadius) {
        const force = (interactionRadius - distance) / interactionRadius;
        this.vx -= dx * force * 0.05;
        this.vy -= dy * force * 0.05;
      }

      this.x += this.vx;
      this.y += this.vy;
      this.vx *= 0.95;
      this.vy *= 0.95;

      this.age++;
      if (this.age > this.life) this.reset();

      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }

    draw(context) {
      const alpha = 1 - Math.abs(this.age / this.life - 0.5) * 2;
      context.globalAlpha = alpha * 0.8;
      context.fillStyle = this.color;
      context.fillRect(this.x, this.y, 1.5, 1.5);
    }
  }

  function init() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());
  }

  function drawStaticFrame() {
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${TRAIL_COLOR})`;
    ctx.fillRect(0, 0, width, height);
    particles.forEach((p) => p.draw(ctx));
    ctx.globalAlpha = 1;
  }

  function animate() {
    if (!running) return;
    ctx.fillStyle = `rgba(${TRAIL_COLOR}, ${TRAIL_OPACITY})`;
    ctx.fillRect(0, 0, width, height);

    particles.forEach((p) => {
      p.update();
      p.draw(ctx);
    });
    ctx.globalAlpha = 1;

    animationFrameId = requestAnimationFrame(animate);
  }

  function start() {
    if (running || prefersReducedMotion) return;
    running = true;
    animate();
  }

  function stop() {
    running = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  }

  function handleResize() {
    width = container.clientWidth;
    height = container.clientHeight;
    init();
    if (prefersReducedMotion) drawStaticFrame();
  }

  function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  }

  function handleMouseLeave() {
    mouse.x = -1000;
    mouse.y = -1000;
  }

  init();

  if (prefersReducedMotion) {
    drawStaticFrame();
  } else {
    window.addEventListener('resize', handleResize, { passive: true });
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => entries.forEach((entry) => (entry.isIntersecting ? start() : stop())),
        { threshold: 0.15 }
      );
      observer.observe(container);
    } else {
      start();
    }
  }
})();
