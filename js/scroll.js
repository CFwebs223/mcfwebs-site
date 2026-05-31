/* ==========================================================================
   Scroll Animations & Micro-Interactions
   Ink trail, reveals, parallax, cursor, process path, counters
   ========================================================================== */

class ScrollAnimations {
  constructor() {
    this.observers = [];
  }

  init() {
    this._initReveals();
    this._initParallax();
    this._initCursorFollower();
    this._initInkTrail();
    this._initProcessPath();
    this._initProcessSteps();
    this._initCounter();
  }

  /* --- Scroll reveal animations --- */
  _initReveals() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          if (!entry.target.classList.contains('re-trigger')) {
            observer.unobserve(entry.target);
          }
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach((el) => {
      observer.observe(el);
    });
    this.observers.push(observer);
  }

  /* --- Parallax --- */
  _initParallax() {
    const els = document.querySelectorAll('.parallax');
    if (!els.length) return;
    let ticking = false;

    const update = () => {
      const sy = window.scrollY;
      els.forEach((el) => {
        const speed = parseFloat(el.dataset.speed || 0.15);
        const rect = el.getBoundingClientRect();
        const offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * speed * -0.5;
        el.style.transform = `translateY(${offset}px)`;
      });
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* --- Cursor follower --- */
  _initCursorFollower() {
    const follower = document.querySelector('.cursor-follower');
    if (!follower) return;
    if (window.matchMedia('(hover: none)').matches) return;

    let mx = 0, my = 0, cx = 0, cy = 0, visible = false, last = 0;

    const update = () => {
      cx += (mx - cx) * 0.1;
      cy += (my - cy) * 0.1;
      follower.style.transform = `translate(${cx - 8}px, ${cy - 8}px)`;

      if (Date.now() - last > 3000 && visible) {
        follower.classList.remove('visible');
        visible = false;
      }
      requestAnimationFrame(update);
    };

    document.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY; last = Date.now();
      if (!visible) {
        cx = mx; cy = my;
        follower.classList.add('visible');
        visible = true;
      }
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
      follower.classList.remove('visible');
      visible = false;
    });

    update();
  }

  /* --- Ink trail — scroll progress line --- */
  _initInkTrail() {
    const trail = document.querySelector('.ink-trail-line');
    if (!trail) return;

    const totalLength = trail.getTotalLength ? trail.getTotalLength() : 2000;
    trail.style.strokeDasharray = totalLength;
    trail.style.strokeDashoffset = totalLength;

    let ticking = false;

    const update = () => {
      const scrollPct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
      const offset = totalLength * (1 - Math.min(scrollPct, 1));
      trail.style.strokeDashoffset = Math.max(offset, 0);
      ticking = false;
    };

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  }

  /* --- Process S-curve SVG path animation --- */
  _initProcessPath() {
    const path = document.querySelector('.process-path-progress');
    const steps = document.querySelectorAll('.process-step');
    if (!path || !steps.length) return;

    const totalLength = path.getTotalLength ? path.getTotalLength() : 2000;
    path.style.strokeDasharray = totalLength;
    path.style.strokeDashoffset = totalLength;

    const stepObserver = new IntersectionObserver((entries) => {
      let maxVisible = -1;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const idx = parseInt(entry.target.dataset.index || 0);
          if (idx > maxVisible) maxVisible = idx;
        }
      });

      const pct = maxVisible >= 0 ? (maxVisible / (steps.length - 1)) * 100 : 0;
      path.style.strokeDashoffset = totalLength * (1 - Math.min(pct / 100 + 0.15, 1));

      // Also show the dot
      if (maxVisible >= 0) {
        const dot = steps[maxVisible]?.querySelector('.process-dot');
        if (dot) dot.classList.add('visible');
      }
    }, { threshold: 0.3, rootMargin: '0px 0px -40px 0px' });

    steps.forEach((step, i) => {
      step.dataset.index = i;
      stepObserver.observe(step);
    });
    this.observers.push(stepObserver);
  }

  /* --- Legacy process steps reveal --- */
  _initProcessSteps() {
    // Dots get revealed by _initProcessPath already
  }

  /* --- Animated counters --- */
  _initCounter() {
    const counters = document.querySelectorAll('[data-count-to]');
    if (!counters.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          this._animateCounter(
            el,
            parseInt(el.dataset.countTo),
            el.dataset.countSuffix || '',
            parseInt(el.dataset.countDuration || '2000')
          );
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.5 });

    counters.forEach((el) => observer.observe(el));
    this.observers.push(observer);
  }

  _animateCounter(el, target, suffix, duration) {
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.floor(eased * target) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target + suffix;
    };
    requestAnimationFrame(tick);
  }

  destroy() {
    this.observers.forEach((obs) => obs.disconnect());
  }
}
window.ScrollAnimations = ScrollAnimations;
