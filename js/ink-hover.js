/* ==========================================================================
   Ink Hover — translucent ink-drip effect on hover, sitewide, for any
   text element. Ink colour inverts against the hovered text: black/ink
   text gets a red drip, red/crimson text gets a translucent black drip
   — so the drip always reads clearly against the word it's on.
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
        // Only treat it as a text target if it has its own direct text
        // (not just nested elements/whitespace) — keeps this from firing
        // on every layout <div> wrapper.
        const hasOwnText = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && n.textContent.trim().length > 0
        );
        if (hasOwnText) return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  const activeTimers = new WeakMap();

  function spawnDrip(el, clientX, clientY) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    if (getComputedStyle(el).position === 'static') {
      el.classList.add('ink-hover-target');
    }

    const x = clientX != null ? clientX - rect.left : rect.width * (0.2 + Math.random() * 0.6);
    const y = clientY != null ? clientY - rect.top : rect.height * (0.3 + Math.random() * 0.3);

    const reddish = isReddish(getComputedStyle(el).color);
    const drip = document.createElement('span');
    drip.className = 'ink-drip ' + (reddish ? 'ink-drip-black' : 'ink-drip-red');
    drip.style.left = x + 'px';
    drip.style.top = y + 'px';
    el.appendChild(drip);
    drip.addEventListener('animationend', () => drip.remove(), { once: true });
  }

  document.addEventListener(
    'mouseover',
    (e) => {
      const el = findTextTarget(e.target);
      if (!el || activeTimers.has(el)) return;

      spawnDrip(el, e.clientX, e.clientY);
      const timer = setInterval(() => spawnDrip(el), 650);
      activeTimers.set(el, timer);
    },
    { passive: true }
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      const el = findTextTarget(e.target);
      if (!el) return;
      // Only clear once the pointer actually leaves this element (not just
      // moving between its children).
      if (el.contains(e.relatedTarget)) return;
      const timer = activeTimers.get(el);
      if (timer) {
        clearInterval(timer);
        activeTimers.delete(el);
      }
    },
    { passive: true }
  );

  document.addEventListener(
    'mousemove',
    (e) => {
      if (Math.random() > 0.03) return;
      const el = findTextTarget(e.target);
      if (el && activeTimers.has(el)) spawnDrip(el, e.clientX, e.clientY);
    },
    { passive: true }
  );
})();
