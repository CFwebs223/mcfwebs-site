/* ==========================================================================
   Ink Hover — translucent ink-drip effect on big text (headings/display
   type) sitewide. A small drip spawns where the cursor enters/moves over
   the text and repeats gently while hovering, then fades — like ink
   bleeding into paper, matching the site's existing ink/brush motif.
   ========================================================================== */

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SELECTOR = 'h1, h2, .display-xl, .display-lg, .display-md, .headline-lg, .headline-md';
  const targets = document.querySelectorAll(SELECTOR);
  if (!targets.length) return;

  targets.forEach((el) => {
    el.classList.add('ink-hover-target');
    let dripTimer = null;

    function spawnDrip(clientX, clientY) {
      const rect = el.getBoundingClientRect();
      const x = clientX != null ? clientX - rect.left : rect.width * (0.2 + Math.random() * 0.6);
      const y = clientY != null ? clientY - rect.top : rect.height * (0.3 + Math.random() * 0.3);

      const drip = document.createElement('span');
      drip.className = 'ink-drip';
      drip.style.left = x + 'px';
      drip.style.top = y + 'px';
      el.appendChild(drip);
      drip.addEventListener('animationend', () => drip.remove(), { once: true });
    }

    el.addEventListener('mouseenter', (e) => {
      spawnDrip(e.clientX, e.clientY);
      dripTimer = setInterval(() => spawnDrip(), 600);
    });

    el.addEventListener('mousemove', (e) => {
      if (Math.random() < 0.04) spawnDrip(e.clientX, e.clientY);
    });

    el.addEventListener('mouseleave', () => {
      if (dripTimer) clearInterval(dripTimer);
      dripTimer = null;
    });
  });
})();
