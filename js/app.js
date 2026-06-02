/* ==========================================================================
   MCFWebs — Main Entry Point
   Hover-mask hero, scroll video, scroll reveals, nav
   ========================================================================== */

class MCFWebs {
  constructor() {
    this.scrollAnimations = null;
    this.heroMask = null;
    this.scrollVideo = null;
    this.scrollStarted = false;
    this.init();
  }

  async init() {
    // Loading screen
    this._initLoading();

    // Wait for fonts
    await this._loadFonts();

    // Hover mask hero
    this._initHeroMask();

    // Scroll video (preloads first frame)
    this._initScrollVideo();

    // Initialize scroll animations
    this._initScroll();

    // Initialize smooth anchor links
    this._initSmoothLinks();

    // Initialize mobile navigation
    this._initMobileNav();

    // NAV scroll state — also handles hero/video transition
    this._initNavScroll();

    // Update copyright year
    this._initCopyright();

    // Hide loading screen after everything is ready
    this._hideLoading();
  }

  _initLoading() {
    this.loadingScreen = document.querySelector('.loading-screen');
  }

  async _loadFonts() {
    try {
      if (document.fonts) {
        await Promise.all([
          document.fonts.load('700 1em "Playfair Display"'),
          document.fonts.load('600 1em "Hanken Grotesk"'),
        ]);
      }
    } catch {
      // Fonts are optional
    }
  }

  _initHeroMask() {
    const hero = document.querySelector('.hero');
    if (hero) {
      this.heroMask = new HoverMaskHero(hero);
    }
  }

  _initScrollVideo() {
    this.scrollVideo = new ScrollVideo();
  }

  _initScroll() {
    this.scrollAnimations = new ScrollAnimations();
    this.scrollAnimations.init();
  }

  _initSmoothLinks() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(anchor.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  _initNavScroll() {
    const nav = document.querySelector('.nav');
    const hero = document.querySelector('.hero');
    if (!nav) return;

    const onScroll = () => {
      const scrollY = window.scrollY || window.pageYOffset;

      // Nav state
      nav.classList.toggle('nav-scrolled', scrollY > 60);

      // INSTANT transition: first scroll hides hero, shows video
      if (scrollY > 1 && !this.scrollStarted) {
        this.scrollStarted = true;

        if (this.heroMask) {
          this.heroMask.pause();
        }

        if (hero) {
          hero.classList.add('hero-hidden');
        }

        if (this.scrollVideo) {
          this.scrollVideo.scrollStarted();
        }
      }

      // If scrolled back to top, restore hero
      if (scrollY <= 1 && this.scrollStarted) {
        this.scrollStarted = false;

        if (hero) {
          hero.classList.remove('hero-hidden');
        }

        if (this.heroMask) {
          this.heroMask.resume();
        }

        if (this.scrollVideo) {
          this.scrollVideo.scrollBack();
        }
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  _initMobileNav() {
    const toggle = document.querySelector('.nav-mobile-toggle');
    const nav = document.getElementById('mobile-nav');
    const close = document.getElementById('mobile-nav-close');

    if (!toggle || !nav) return;

    const open = () => {
      nav.classList.add('open');
      document.body.style.overflow = 'hidden';
    };

    const closeNav = () => {
      nav.classList.remove('open');
      document.body.style.overflow = '';
    };

    toggle.addEventListener('click', open);
    if (close) close.addEventListener('click', closeNav);

    nav.querySelectorAll('.mobile-nav-link').forEach((link) => {
      link.addEventListener('click', closeNav);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) closeNav();
    });
  }

  _initCopyright() {
    const yearEl = document.getElementById('copyright-year');
    if (yearEl) {
      yearEl.textContent = new Date().getFullYear();
    }
  }

  _hideLoading() {
    // Wait for fonts, mask hero, and at least 1.2s before hiding
    const minWait = new Promise((r) => setTimeout(r, 1200));
    const heroReady = new Promise((r) => {
      const check = () => {
        if (this.heroMask && this.heroMask.ready) { r(); return; }
        setTimeout(check, 100);
      };
      check();
    });
    // Also wait for scroll video
    const videoReady = new Promise((r) => {
      const check = () => {
        if (this.scrollVideo && this.scrollVideo.ready) { r(); return; }
        setTimeout(check, 100);
      };
      check();
    });

    Promise.race([Promise.all([minWait, heroReady, videoReady]), new Promise((r) => setTimeout(r, 5000))]).then(() => {
      if (this.loadingScreen) {
        this.loadingScreen.classList.add('hidden');
        setTimeout(() => {
          if (this.loadingScreen && this.loadingScreen.parentNode) {
            this.loadingScreen.parentNode.removeChild(this.loadingScreen);
          }
        }, 800);
      }
    });
  }
}

// Boot
document.addEventListener('DOMContentLoaded', () => {
  new MCFWebs();
});
