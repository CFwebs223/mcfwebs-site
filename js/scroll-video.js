/* ==========================================================================
   ScrollVideo — High-performance scroll-driven video playback
   Uses direct GPU-accelerated video element seeking with lerped
   animation-frame seeking and in-flight seek checks to stay smooth.
   Pairs with Lenis (js/smooth-scroll.js) which smooths the scroll input
   itself, so the scrub reads as one continuous buttery motion.
   ========================================================================== */

class ScrollVideo {
  constructor() {
    this.section = document.querySelector('.scroll-video');
    this.sticky = document.querySelector('.scroll-video-sticky');
    this.progressBar = document.querySelector('.scroll-video-progress-fill');
    this.progressPct = document.querySelector('.scroll-video-progress-pct');

    if (!this.sticky) return;

    this.ready = false;
    this.lastTextPhase = -1;
    this.targetProgress = 0;
    this.currentProgress = 0;
    this.isActive = false;

    // Direct display video
    this.video = document.createElement('video');
    this.video.id = 'scroll-video-el';
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.loop = false;
    this.video.preload = 'auto';

    this.phases = [
      { start: 0, end: 0.2, label: 'The Beginning', title: 'A Single\nStroke', desc: 'Every creation begins as a moment of intention — ink meeting paper.' },
      { start: 0.25, end: 0.45, label: 'Flow', title: 'Finding the\nCurrent', desc: 'The koi navigates with purpose, turning resistance into momentum.' },
      { start: 0.5, end: 0.7, label: 'Emergence', title: 'Form from\nWater', desc: 'Ideas crystallize. The abstract becomes the unmistakable.' },
      { start: 0.75, end: 1.0, label: 'Expression', title: 'The Final\nReveal', desc: 'What was once in the mind now commands the space it occupies.' }
    ];

    this._init();
  }

  async _init() {
    try {
      const isMobile = window.innerWidth < 768;
      const videoBase = isMobile ? 'videos/scroll-koi-mobile' : 'videos/scroll-koi';

      // Mobile has mp4 only (no webm), desktop has both
      const mp4Src = document.createElement('source');
      mp4Src.src = videoBase + '.mp4';
      mp4Src.type = 'video/mp4';
      this.video.appendChild(mp4Src);

      if (!isMobile) {
        const webmSrc = document.createElement('source');
        webmSrc.src = videoBase + '.webm';
        webmSrc.type = 'video/webm';
        this.video.appendChild(webmSrc);
      }

      await new Promise((resolve, reject) => {
        this.video.addEventListener('loadedmetadata', resolve, { once: true });
        this.video.addEventListener('error', (e) => { if (this.video.duration > 0) resolve(); else reject(e); }, { once: true });
        this.video.load();
      });

      if (!this.video.duration || this.video.duration <= 0) throw new Error('No duration');

      // Insert video into DOM (after sticky but before overlays)
      this.sticky.insertBefore(this.video, this.sticky.firstChild);

      // Force seek to 0 first
      this.video.currentTime = 0;
      this.ready = true;
      this.video.classList.add('visible');

      // Start RAF loop
      this._loop();

      window.addEventListener('scroll', () => this._onScroll(), { passive: true });
    } catch (e) {
      console.warn('ScrollVideo init failed:', e);
      if (this.section) this.section.style.display = 'none';
    }
  }

  scrollStarted() {
    this.isActive = true;
    this.video.classList.add('visible');
  }

  scrollBack() {
    this.isActive = false;
    this.targetProgress = 0;
    this.video.classList.remove('visible');
  }

  _onScroll() {
    if (!this.ready) return;

    const rect = this.section.getBoundingClientRect();
    const total = this.section.offsetHeight - window.innerHeight;
    if (total <= 0) return;

    const progress = Math.min(1, Math.max(0, -rect.top / total));
    this.targetProgress = progress;

    if (this.progressBar) this.progressBar.style.height = (progress * 100) + '%';
    if (this.progressPct) this.progressPct.textContent = Math.round(progress * 100) + '%';

    this._updateText(progress);
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    if (!this.ready || !this.video) return;

    // Smoothly interpolate currentProgress towards targetProgress.
    // Lenis already smooths the scroll input, so a slightly quicker lerp
    // here keeps the video tightly coupled to the (already-smooth) scroll
    // without adding perceptible lag on top.
    const diff = this.targetProgress - this.currentProgress;
    this.currentProgress += diff * 0.12;

    // Check if the current time matches the target time
    const targetTime = this.currentProgress * this.video.duration;
    const timeDiff = Math.abs(this.video.currentTime - targetTime);

    // Only update currentTime if it differs meaningfully and no seek is
    // already in flight — prevents seek congestion and stutter.
    if (timeDiff > 0.02 && !this.video.seeking) {
      this.video.currentTime = targetTime;
    }
  }

  _updateText(progress) {
    let idx = -1;
    for (let i = 0; i < this.phases.length; i++) {
      if (progress >= this.phases[i].start && progress < this.phases[i].end) { idx = i; break; }
    }
    if (idx === this.lastTextPhase) return;

    const le = document.querySelector('.scroll-text-label');
    const te = document.querySelector('.scroll-text-title');
    const de = document.querySelector('.scroll-text-desc');

    // Fade out elements first
    if (le) le.classList.remove('visible');
    if (te) te.classList.remove('visible');
    if (de) de.classList.remove('visible');

    this.lastTextPhase = idx;
    if (idx < 0) return;

    const p = this.phases[idx];

    // Wait slightly for fade-out, then update content and fade-in
    setTimeout(() => {
      if (idx !== this.lastTextPhase) return; // Ignore if user scrolled past
      if (le) { le.textContent = p.label; le.classList.add('visible'); }
      if (te) { te.innerHTML = p.title; te.classList.add('visible'); }
      if (de) { de.textContent = p.desc; de.classList.add('visible'); }
    }, 150); // matches CSS transition fade-out time
  }

  destroy() {
    if (this.video) {
      this.video.pause();
      this.video.src = '';
      this.video.remove();
    }
  }
}
