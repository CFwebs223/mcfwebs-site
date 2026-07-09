/* ==========================================================================
   Ink Hover — the hovered text itself wobbles slightly and bleeds a
   glossy, lit ink-drip trail downward, via an SVG filter applied
   directly to the element (distorts the real glyphs in place — no
   overlay elements, no duplicated letters).

   Two things that made the first attempt look like "glitching patches"
   rather than ink, both fixed here:
   1. The turbulence noise field was continuously re-randomised via an
      <animate> on baseFrequency — changing that shuffles the noise
      pattern discontinuously frame to frame, which reads as flicker/
      static, not a smooth melt. The noise field is now static; only
      the CSS filter reference itself is toggled on hover.
   2. There was no actual lighting model — just a flat blurred colour
      patch. feSpecularLighting (a real SVG "3D surface from a bump
      map" primitive, the same tool used for glossy/embossed/wet-look
      text effects) now lights the drip's own alpha shape, giving it an
      actual highlight and a sense of a rounded, wet surface.

   Ink colour inverts against the hovered text: dark/ink text gets a
   red drip, red/crimson text gets a translucent black drip.
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
        '<filter id="' + id + '" x="-30%" y="-25%" width="160%" height="340%" color-interpolation-filters="sRGB">' +
          // Gentle organic wobble on the glyphs themselves — smooth
          // Perlin-like turbulence, not the grainier fractalNoise, and
          // no animation on it (that's what caused the flicker).
          '<feTurbulence type="turbulence" baseFrequency="0.018 0.045" numOctaves="2" seed="7" result="noise" />' +
          '<feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" result="wobble" />' +

          // Drip trail: the glyphs' own alpha shape, stretched downward
          // in three bands with progressively more blur and less
          // opacity — a smooth taper rather than abrupt layers.
          '<feOffset in="SourceAlpha" dx="0" dy="3" result="o1" />' +
          '<feGaussianBlur in="o1" stdDeviation="1" result="b1" />' +
          '<feComponentTransfer in="b1" result="b1f"><feFuncA type="linear" slope="0.9" /></feComponentTransfer>' +
          '<feOffset in="SourceAlpha" dx="0" dy="10" result="o2" />' +
          '<feGaussianBlur in="o2" stdDeviation="2.6" result="b2" />' +
          '<feComponentTransfer in="b2" result="b2f"><feFuncA type="linear" slope="0.55" /></feComponentTransfer>' +
          '<feOffset in="SourceAlpha" dx="0" dy="20" result="o3" />' +
          '<feGaussianBlur in="o3" stdDeviation="5.5" result="b3" />' +
          '<feComponentTransfer in="b3" result="b3f"><feFuncA type="linear" slope="0.3" /></feComponentTransfer>' +
          '<feMerge result="dripShape">' +
            '<feMergeNode in="b1f" /><feMergeNode in="b2f" /><feMergeNode in="b3f" />' +
          '</feMerge>' +

          // Tint the drip with the ink colour (alpha already tapered above).
          '<feColorMatrix in="dripShape" type="matrix" values="' +
            '0 0 0 0 ' + rgb[0] + ' ' +
            '0 0 0 0 ' + rgb[1] + ' ' +
            '0 0 0 0 ' + rgb[2] + ' ' +
            '0 0 0 1 0" result="tintedDrip" />' +

          // 3D gloss: light the drip's own (blurred) alpha as a bump
          // map, so it reads as a rounded, wet surface with a real
          // highlight rather than a flat colour patch.
          '<feGaussianBlur in="dripShape" stdDeviation="1.6" result="bump" />' +
          '<feSpecularLighting in="bump" surfaceScale="4.5" specularConstant="1" specularExponent="16" lighting-color="#ffffff" result="spec">' +
            '<fePointLight x="-20" y="-70" z="60" />' +
          '</feSpecularLighting>' +
          '<feComposite in="spec" in2="dripShape" operator="in" result="specClipped" />' +

          '<feMerge result="glossyDrip">' +
            '<feMergeNode in="tintedDrip" /><feMergeNode in="specClipped" />' +
          '</feMerge>' +

          '<feMerge>' +
            '<feMergeNode in="glossyDrip" /><feMergeNode in="wobble" />' +
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
