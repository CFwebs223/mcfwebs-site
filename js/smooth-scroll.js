/* ==========================================================================
   Smooth Scroll — Lenis inertia scrolling for a buttery, non-clunky feel.
   Skipped entirely for prefers-reduced-motion (native scroll instead).
   ========================================================================== */

(function () {
  if (typeof Lenis === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const isMobile = window.matchMedia('(pointer: coarse)').matches;

  const lenis = new Lenis({
    duration: isMobile ? 1.1 : 1.3,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.2,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  window.__lenis = lenis;
})();
