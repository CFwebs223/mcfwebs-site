/* ==========================================================================
   StoryStroke — Phase 2: a single continuous ink-stroke line that winds
   down the page's left gutter and reveals itself as you scroll (via
   stroke-dashoffset), literalizing the "A Single Stroke" language
   already used in the scroll-video copy. One path, generated to match
   whatever the actual page height is, so it always runs from the very
   top to the very bottom regardless of content changes.

   Purely additive: sits in the left margin gutter (desktop/tablet only
   — hidden below 768px where there's no safe gutter space to avoid
   crossing under text), z-index above the mood wash, below all real
   content. Touches no existing markup.
   ========================================================================== */

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const NS = 'http://www.w3.org/2000/svg';
  const WIDTH = 60;
  const AMPLITUDE = 26;
  const SEGMENT = 260; // px of vertical travel per left-right half-wave

  const wrap = document.createElement('div');
  wrap.id = 'story-stroke';

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', WIDTH);
  svg.setAttribute('preserveAspectRatio', 'none');

  const defs = document.createElementNS(NS, 'defs');
  const filter = document.createElementNS(NS, 'filter');
  filter.setAttribute('id', 'story-stroke-glow');
  filter.setAttribute('x', '-200%');
  filter.setAttribute('y', '-200%');
  filter.setAttribute('width', '500%');
  filter.setAttribute('height', '500%');
  const blur = document.createElementNS(NS, 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '4');
  filter.appendChild(blur);
  defs.appendChild(filter);
  svg.appendChild(defs);

  // Glow pass (soft, wide, blurred — the ink "bleed") behind the crisp
  // line on top of it, both sharing the same path data.
  const glowPath = document.createElementNS(NS, 'path');
  glowPath.setAttribute('class', 'story-stroke-glow-path');
  glowPath.setAttribute('filter', 'url(#story-stroke-glow)');
  svg.appendChild(glowPath);

  const path = document.createElementNS(NS, 'path');
  svg.appendChild(path);
  wrap.appendChild(svg);
  document.body.appendChild(wrap);

  let pathLength = 0;

  function buildPath(height) {
    const mid = WIDTH / 2;
    let d = `M ${mid} 0`;
    let y = 0;
    let dir = 1;
    while (y < height) {
      const nextY = Math.min(y + SEGMENT, height);
      const cx = mid + dir * AMPLITUDE;
      const cy1 = y + (nextY - y) * 0.3;
      const cy2 = y + (nextY - y) * 0.7;
      d += ` C ${cx} ${cy1}, ${cx} ${cy2}, ${mid} ${nextY}`;
      y = nextY;
      dir *= -1;
    }
    return d;
  }

  function layout() {
    const height = document.documentElement.scrollHeight;
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${WIDTH} ${height}`);
    const d = buildPath(height);
    path.setAttribute('d', d);
    glowPath.setAttribute('d', d);
    pathLength = path.getTotalLength();
    path.style.strokeDasharray = String(pathLength);
    glowPath.style.strokeDasharray = String(pathLength);
    update();
  }

  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    const offset = String(pathLength * (1 - p));
    path.style.strokeDashoffset = offset;
    glowPath.style.strokeDashoffset = offset;
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', layout, { passive: true });
  window.addEventListener('load', layout);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => setTimeout(layout, 100));
  }
  layout();
  // Late safety pass: images/frame-sequence content can still settle
  // page height a moment after load.
  setTimeout(layout, 1500);
})();
