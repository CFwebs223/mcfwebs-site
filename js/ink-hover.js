/* ==========================================================================
   Ink Hover — the hovered text itself melts/wobbles and bleeds a tinted
   drip trail downward, via an SVG filter (feTurbulence + feDisplacementMap
   for the wobble, feOffset/feGaussianBlur/feColorMatrix on the text's own
   alpha shape for the drip trail). This distorts the real glyphs in place
   — no overlay elements, no duplicated letters.

   Ink colour inverts against the hovered text: dark/ink text gets a red
   drip, red/crimson text gets a translucent black drip.
   ========================================================================== */

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const TEXT_SELECTOR =
    'h1, h2, h3, h4, h5, h6, p, a, span, li, label, button, blockquote, dt, dd, td, th, div';

  function injectFilters() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.setAttribute('aria-hidden', 'true');

    function buildFilter(id, rgb) {
      return (
        '<filter id="' + id + '" x="-30%" y="-20%" width="160%" height="280%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.01 0.09" numOctaves="2" seed="7" result="noise">' +
        '<animate attributeName="baseFrequency" dur="2.6s" values="0.01 0.07;0.012 0.11;0.01 0.07" repeatCount="indefinite" />' +
        '</feTurbulence>' +
        '<feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G" result="wobble" />' +
        '<feOffset in="SourceAlpha" dx="0" dy="5" result="off1" />' +
        '<feGaussianBlur in="off1" stdDeviation="1.6" result="blur1" />' +
        '<feOffset in="SourceAlpha" dx="0" dy="14" result="off2" />' +
        '<feGaussianBlur in="off2" stdDeviation="3.4" result="blur2" />' +
        '<feMerge result="trailAlpha">' +
        '<feMergeNode in="blur1" /><feMergeNode in="blur2" />' +
        '</feMerge>' +
        '<feColorMatrix in="trailAlpha" type="matrix" values="' +
        '0 0 0 0 ' + rgb[0] + ' ' +
        '0 0 0 0 ' + rgb[1] + ' ' +
        '0 0 0 0 ' + rgb[2] + ' ' +
        '0 0 0 0.55 0" result="tintedTrail" />' +
        '<feMerge>' +
        '<feMergeNode in="tintedTrail" /><feMergeNode in="wobble" />' +
        '</feMerge>' +
        '</filter>'
      );
    }

    svg.innerHTML =
      '<defs>' +
      buildFilter('ink-drip-red', [0.737, 0, 0.176]) + // crimson #bc002d
      buildFilter('ink-drip-black', [0.1, 0.1, 0.1]) +
      '</defs>';

    document.body.appendChild(svg);
  }

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

  injectFilters();

  document.addEventListener(
    'mouseover',
    (e) => {
      const el = findTextTarget(e.target);
      if (!el || el.classList.contains('ink-dripping')) return;
      const reddish = isReddish(getComputedStyle(el).color);
      el.classList.add('ink-dripping');
      el.style.filter = 'url(#' + (reddish ? 'ink-drip-black' : 'ink-drip-red') + ')';
    },
    { passive: true }
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      const el = findTextTarget(e.target);
      if (!el || !el.classList.contains('ink-dripping')) return;
      if (el.contains(e.relatedTarget)) return;
      el.classList.remove('ink-dripping');
      el.style.filter = '';
    },
    { passive: true }
  );
})();
