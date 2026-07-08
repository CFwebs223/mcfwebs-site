/* ==========================================================================
   ScrollVideo — Section progress + chapter text reveal for the koi/ink
   narrative section. The video-scrubbing mechanism that used to live here
   has been removed (per-frame video seeking was the main source of scroll
   jank); the ambient KoiScene now provides the swimming visual, and this
   class just tracks section scroll progress to drive the progress bar and
   chapter text, exactly as before.
   ========================================================================== */

class ScrollVideo {
  constructor() {
    this.section = document.querySelector('.scroll-video');
    this.sticky = document.querySelector('.scroll-video-sticky');
    this.progressBar = document.querySelector('.scroll-video-progress-fill');
    this.progressPct = document.querySelector('.scroll-video-progress-pct');

    if (!this.sticky || !this.section) return;

    this.ready = true;
    this.lastTextPhase = -1;

    this.phases = [
      { start: 0, end: 0.2, label: 'The Beginning', title: 'A Single\nStroke', desc: 'Every creation begins as a moment of intention — ink meeting paper.' },
      { start: 0.25, end: 0.45, label: 'Flow', title: 'Finding the\nCurrent', desc: 'The koi navigates with purpose, turning resistance into momentum.' },
      { start: 0.5, end: 0.7, label: 'Emergence', title: 'Form from\nWater', desc: 'Ideas crystallize. The abstract becomes the unmistakable.' },
      { start: 0.75, end: 1.0, label: 'Expression', title: 'The Final\nReveal', desc: 'What was once in the mind now commands the space it occupies.' }
    ];

    window.addEventListener('scroll', () => this._onScroll(), { passive: true });
    this._onScroll();
  }

  // Kept as no-ops: app.js's nav-scroll handler still calls these to
  // coordinate the hero/video hand-off. Only the video itself is gone —
  // the koi scene now provides the swimming visual regardless of this
  // section's state.
  scrollStarted() {}
  scrollBack() {}

  _onScroll() {
    const rect = this.section.getBoundingClientRect();
    const total = this.section.offsetHeight - window.innerHeight;
    if (total <= 0) return;

    const progress = Math.min(1, Math.max(0, -rect.top / total));

    if (this.progressBar) this.progressBar.style.height = (progress * 100) + '%';
    if (this.progressPct) this.progressPct.textContent = Math.round(progress * 100) + '%';

    this._updateText(progress);
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

    if (le) le.classList.remove('visible');
    if (te) te.classList.remove('visible');
    if (de) de.classList.remove('visible');

    this.lastTextPhase = idx;
    if (idx < 0) return;

    const p = this.phases[idx];

    setTimeout(() => {
      if (idx !== this.lastTextPhase) return;
      if (le) { le.textContent = p.label; le.classList.add('visible'); }
      if (te) { te.innerHTML = p.title; te.classList.add('visible'); }
      if (de) { de.textContent = p.desc; de.classList.add('visible'); }
    }, 150);
  }
}
