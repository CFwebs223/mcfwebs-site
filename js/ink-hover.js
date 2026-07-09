/* ==========================================================================
   Ink Hover — real, animated ink melting inside each hovered letter.

   Fourth rebuild of this effect. Verified live in-browser this time
   (previous three were built blind) — a genuine WebGL shader, not a CSS
   trick:
   1. The hovered element's exact text is rendered to an offscreen 2D
      canvas, producing an alpha mask of its real glyph shapes. This is
      what confines the ink strictly *inside* the letters.
   2. A GLSL fragment shader distorts that mask's edges with smooth,
      slow, low-frequency noise (an organic melt, not jittery static),
      and derives a per-pixel surface normal from the distorted mask
      (treating it as a bump map).
   3. That normal drives a real Blinn-Phong-style specular + diffuse
      lighting calculation — this is what gives it genuine 3D depth
      (a dark-to-bright gradient following an actual light direction,
      plus a glossy highlight) instead of a flat, static color.

   Colour still contrasts the hovered text's own base colour: red ink
   on dark text, translucent black ink on red/crimson text.

   Scope note: reliably rendering an exact text mask requires knowing
   the text's real line breaks. That's straightforward for headings,
   links, labels, and buttons (short, single/known-line text) but not
   for freely-wrapping paragraphs, so this targets the former rather
   than literally every text node on the page.
   ========================================================================== */

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof THREE === 'undefined') return;

  const TEXT_SELECTOR = 'h1, h2, h3, h4, h5, h6, a, button, label, li, .label-caps';

  const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }';
  const FRAG = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uMask;
    uniform float uTime;
    uniform vec3 uColorDark;
    uniform vec3 uColorBright;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
      m = m * m; m = m * m;
      vec3 x = 2.0 * fract(p * 0.024390243902439) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
      vec3 g;
      g.x = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vec2 uv = vUv;
      float n1 = snoise(uv * 2.0 + vec2(0.0, uTime * 0.16));
      float n2 = snoise(uv * 3.2 - vec2(uTime * 0.11, uTime * 0.07));
      vec2 dUv = vec2(n1, n2) * 0.0038;

      float mask = texture2D(uMask, uv + dUv).a;
      float d = 0.0016;
      float maskL = texture2D(uMask, uv + dUv + vec2(-d, 0.0)).a;
      float maskR = texture2D(uMask, uv + dUv + vec2(d, 0.0)).a;
      float maskU = texture2D(uMask, uv + dUv + vec2(0.0, d)).a;
      float maskD = texture2D(uMask, uv + dUv + vec2(0.0, -d)).a;

      vec3 normal = normalize(vec3((maskL - maskR) * 5.0, (maskD - maskU) * 5.0, 0.55));
      vec3 lightDir = normalize(vec3(-0.35, 0.55, 0.7));
      vec3 viewDir = vec3(0.0, 0.0, 1.0);
      float diffuse = max(dot(normal, lightDir), 0.0);
      vec3 halfV = normalize(lightDir + viewDir);
      float spec = pow(max(dot(normal, halfV), 0.0), 20.0);

      vec3 base = mix(uColorDark, uColorBright, diffuse);
      vec3 col = base + spec * 1.8 * vec3(1.0);

      float edge = smoothstep(0.4, 0.6, mask);
      gl_FragColor = vec4(col, edge);
    }
  `;

  const PALETTES = {
    red: { dark: 0x4a0010, bright: 0xff4444 },
    black: { dark: 0x000000, bright: 0x4a4a4a },
  };

  let renderer, scene, camera, mesh, uniforms, overlay, clock, raf;
  let activeEl = null;

  function ensureRenderer() {
    if (renderer) return;
    overlay = document.createElement('canvas');
    overlay.id = 'ink-melt-canvas';
    overlay.style.position = 'fixed';
    overlay.style.zIndex = '5';
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);

    renderer = new THREE.WebGLRenderer({ canvas: overlay, alpha: true, antialias: true });
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    uniforms = {
      uMask: { value: null },
      uTime: { value: 0 },
      uColorDark: { value: new THREE.Color(PALETTES.red.dark) },
      uColorBright: { value: new THREE.Color(PALETTES.red.bright) },
    };
    const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true });
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);
    clock = new THREE.Clock();
  }

  function buildMaskTexture(el, w, h, pad) {
    const style = getComputedStyle(el);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}/${style.lineHeight} ${style.fontFamily}`;
    ctx.textBaseline = 'top';
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    // Split on <br> for elements that use it (this heading pattern is
    // common sitewide); otherwise treat as one line, which covers the
    // vast majority of matched targets (nav links, labels, buttons).
    const lines = el.innerHTML.split('<br>').map((s) => s.replace(/<[^>]+>/g, '').trim());
    lines.forEach((line, i) => ctx.fillText(line, pad, pad + i * lineHeight));
    return new THREE.CanvasTexture(canvas);
  }

  function isReddish(rgbString) {
    const m = rgbString.match(/[\d.]+/g);
    if (!m || m.length < 3) return false;
    const [r, g, b] = m.map(Number);
    return r > 110 && r - g > 35 && r - b > 15;
  }

  function start(el) {
    ensureRenderer();
    if (activeEl === el) return;
    stop();
    activeEl = el;

    const reddish = isReddish(getComputedStyle(el).color);
    const palette = reddish ? PALETTES.black : PALETTES.red;
    uniforms.uColorDark.value.set(palette.dark);
    uniforms.uColorBright.value.set(palette.bright);

    el.__inkPrevColor = el.style.color;
    el.__inkPrevFill = el.style.getPropertyValue('-webkit-text-fill-color');
    el.style.color = 'transparent';
    el.style.setProperty('-webkit-text-fill-color', 'transparent');

    layout(el);

    function tick() {
      raf = requestAnimationFrame(tick);
      uniforms.uTime.value = clock.getElapsedTime();
      renderer.render(scene, camera);
    }
    clock.start();
    tick();
  }

  function layout(el) {
    const rect = el.getBoundingClientRect();
    const pad = Math.max(12, parseFloat(getComputedStyle(el).fontSize) * 0.3);
    const w = Math.ceil(rect.width + pad * 2);
    const h = Math.ceil(rect.height + pad * 2);

    overlay.style.left = rect.left - pad + 'px';
    overlay.style.top = rect.top - pad + 'px';
    overlay.style.width = w + 'px';
    overlay.style.height = h + 'px';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);

    if (uniforms.uMask.value) uniforms.uMask.value.dispose();
    uniforms.uMask.value = buildMaskTexture(el, w, h, pad);
  }

  function stop() {
    if (!activeEl) return;
    cancelAnimationFrame(raf);
    activeEl.style.color = activeEl.__inkPrevColor || '';
    activeEl.style.setProperty('-webkit-text-fill-color', activeEl.__inkPrevFill || '');
    if (overlay) overlay.style.width = '0px';
    activeEl = null;
  }

  function findTarget(el) {
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

  document.addEventListener(
    'mouseover',
    (e) => {
      const el = findTarget(e.target);
      if (el) start(el);
    },
    { passive: true }
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      if (!activeEl) return;
      const el = findTarget(e.target);
      if (el === activeEl && !activeEl.contains(e.relatedTarget)) stop();
    },
    { passive: true }
  );

  window.addEventListener(
    'resize',
    () => {
      if (activeEl) layout(activeEl);
    },
    { passive: true }
  );
})();
