/* ==========================================================================
   Ink Hover — a glossy oil-sheen highlight clipped to the hovered text's
   own letter shapes, moving with the cursor like light shifting across
   an oily/wet surface. Uses background-clip:text, so the sheen is
   physically confined to the glyphs — it cannot exist outside the text.

   Two attempts before this used free-floating effects (an SVG filter on
   the whole element, then falling 3D drops) — both wrong: this is meant
   to live *inside* the letters only and track the cursor, not fall away
   or distort the shape. background-clip:text is the correct, standard
   tool for "a moving highlight confined to text" and needs no canvas,
   filter, or WebGL at all.

   Colour always contrasts the text's own base colour: dark/ink text
   gets a red sheen, red/crimson text gets a black sheen.
   ========================================================================== */

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const TEXT_SELECTOR =
    'h1, h2, h3, h4, h5, h6, p, a, span, li, label, button, blockquote, dt, dd, td, th, div';

  function isReddish(rgbString) {
    const m = rgbString.match(/[\d.]+/g);
    if (!m || m.length < 3) return false;
    const [r, g, b] = m.map(Number);
    return r > 110 && r - g > 35 && r - b > 15;
  }

  function findTextTarget(el) {
    while (el && el !== document.body) {
      if (el.matches && el.matches(TEXT_SELECTOR)) {
        const hasOwnText = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && n.textContent.trim().length > 0
        );
        if (hasOwnText) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function setPointer(el, clientX, clientY) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const mx = ((clientX - rect.left) / rect.width) * 100;
    const my = ((clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--mx', mx + '%');
    el.style.setProperty('--my', my + '%');
  }

  const active = new WeakSet();

  document.addEventListener(
    'mouseover',
    (e) => {
      const el = findTextTarget(e.target);
      if (!el || active.has(el)) return;

      const reddish = isReddish(getComputedStyle(el).color);
      active.add(el);
      el.classList.add('ink-oil-active', reddish ? 'ink-oil-black' : 'ink-oil-red');
      setPointer(el, e.clientX, e.clientY);
    },
    { passive: true }
  );

  document.addEventListener(
    'mousemove',
    (e) => {
      const el = findTextTarget(e.target);
      if (!el || !active.has(el)) return;
      setPointer(el, e.clientX, e.clientY);
    },
    { passive: true }
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      const el = findTextTarget(e.target);
      if (!el || !active.has(el)) return;
      if (el.contains(e.relatedTarget)) return;
      active.delete(el);
      el.classList.remove('ink-oil-active', 'ink-oil-red', 'ink-oil-black');
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    },
    { passive: true }
  );
})();
