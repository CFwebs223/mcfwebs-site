/* ==========================================================================
   StoryScroll — Phase 1: a single continuous mood wash behind the whole
   page, shifting color across total scroll progress (cool "dawn" at the
   hero -> warm "breakthrough" crimson-gold by the final CTA). The koi
   legend — swimming upstream, leaping the gate, becoming a dragon —
   already mirrors the site's own copy (Vision -> Growth, "The Beginning"
   -> "The Final Reveal"); this just makes that arc visible as one
   unbroken thread instead of four separate moments.

   Purely additive: one fixed background layer behind all content,
   z-index below everything (including the ambient koi canvas). Touches
   no existing markup, text, or layout.
   ========================================================================== */

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const DAWN = [239, 244, 247]; // cool pale blue-grey
  const DUSK = [253, 240, 235]; // warm ivory with a whisper of crimson

  const layer = document.createElement('div');
  layer.id = 'story-mood';
  document.body.prepend(layer);

  let ticking = false;

  function progress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function lerp(a, b, t) {
    return Math.round(a + (b - a) * t);
  }

  function update() {
    ticking = false;
    const p = progress();
    const r = lerp(DAWN[0], DUSK[0], p);
    const g = lerp(DAWN[1], DUSK[1], p);
    const b = lerp(DAWN[2], DUSK[2], p);
    layer.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
})();
