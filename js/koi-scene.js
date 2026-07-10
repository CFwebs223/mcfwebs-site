/* ==========================================================================
   KoiScene — ambient Three.js koi swimming the full page length, tied to
   scroll progress, with an idle swim/bob animation independent of scroll.
   ========================================================================== */

class KoiScene {
  constructor() {
    if (typeof THREE === 'undefined') return;

    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.scrollProgress = 0;
    this.clock = new THREE.Clock();

    // Swim progress is driven by scroll *distance travelled*, not scroll
    // *position* — using window.scrollY directly meant scrolling up
    // literally reversed the koi back along their path. Accumulating the
    // absolute delta each frame means any scrolling, in either
    // direction, keeps them swimming forward.
    this._lastScrollY = window.scrollY;
    this._scrollDistance = 0;

    // The hero and the scroll-koi video section both intentionally sit
    // above the koi canvas (they need it to render over their own
    // backgrounds); every other section needs the koi safely behind its
    // text/buttons instead. Rather than enumerate every section (fragile —
    // easy to miss one), the canvas z-index is flipped dynamically: a
    // small positive value while the hero/pond zone is on screen, and a
    // negative one otherwise, which CSS stacking rules guarantee paints
    // below all normal static content with zero enumeration needed.
    this.heroSection = document.querySelector('.hero');
    this.videoSection = document.querySelector('.scroll-video');
    this.ctaSection = document.querySelector('.cta-section');
    this.canvasOpacity = 0;
    this.inFrontZone = true;

    // Phase 3 "leap" moment: as the final CTA comes into view, one koi
    // breaks from the ambient swim loop and arcs up across the screen —
    // the koi-leaps-the-gate legend already implied by the site's own
    // copy (Vision -> Growth), made visible once, right where the story
    // lands. Retriggers each time the section re-enters view.
    this.leapActive = false;
    this.leapTriggered = false;
    this.leapT = 0;
    this.leapBurstFired = false;
    this.leapKoiIndex = 0;

    this.ripples = [];
    this.rippleGeo = null;

    this._buildCanvas();
    this._buildScene();
    this._buildCurve();
    this._buildKoi();
    this._bindEvents();
    this._resize();
    this._loop();
  }

  _buildCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'koi-canvas';
    document.body.insertBefore(this.canvas, document.body.firstChild);
  }

  _buildScene() {
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Orthographic camera mapped 1:1 to viewport pixels for simple placement.
    this.camera = new THREE.OrthographicCamera(0, 0, 0, 0, 0.1, 1000);
    this.camera.position.z = 100;
  }

  /* A gentle, closed winding path the koi circulate along — reads as a
     continuous pond circuit rather than a single one-shot trip down the
     page, since pages can scroll far past one viewport height. */
  _buildCurve() {
    const pts = [
      [0.0, 0.85], [0.4, 0.4], [-0.35, 0.05], [0.35, -0.4],
      [-0.4, -0.8], [0.0, -0.9], [0.5, -0.3], [0.45, 0.35],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0));

    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  }

  // Catmull-Rom through 4 scalars, t in [0,1] between p1 and p2.
  _catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (
      (2 * p1) +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }

  // Deterministic pseudo-random 0..1, used to bake in small irregularities
  // (silhouette wobble, patch edge jaggedness) so shapes don't read as
  // pure math — same input always gives the same output, so it's a fixed
  // "personality" per koi, not per-frame jitter.
  _hashNoise(x, seed) {
    const s = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
    return s - Math.floor(s);
  }

  // Smooth width-at-x lookup over hand-placed control points, so the
  // silhouette is a real curve rather than a faceted straight-line
  // polygon between a handful of points.
  _widthAt(x, ctrl) {
    let i = 0;
    while (i < ctrl.length - 2 && ctrl[i + 1].x < x) i++;
    const p0 = ctrl[Math.max(0, i - 1)].w;
    const p1 = ctrl[i].w;
    const p2 = ctrl[i + 1].w;
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)].w;
    const span = ctrl[i + 1].x - ctrl[i].x;
    const t = span > 0 ? (x - ctrl[i].x) / span : 0;
    return Math.max(0, this._catmullRom(p0, p1, p2, p3, t));
  }

  _makeKoiMesh(paletteIndex) {
    const group = new THREE.Group();

    // Traditional koi palettes: white body with red + black patches
    // (kohaku / sanke-style) — the reds echo the site's own crimson
    // accent rather than drifting toward orange.
    const palettes = [
      { body: 0xfdfaf3, patch: 0xbc002d, spot: 0x232323 },
      { body: 0xfaf6ec, patch: 0xa8082a, spot: 0x1c1c1c },
      { body: 0xf7f3e8, patch: 0xc41e3a, spot: 0x2a2a2a },
    ];
    const c = palettes[paletteIndex % palettes.length];
    const bodyColor = new THREE.Color(c.body);
    const patchColor = new THREE.Color(c.patch);
    const spotColor = new THREE.Color(c.spot);

    // Hand-placed profile control points, nose (x=1) to tail stalk
    // (x=-1) — interpolated with Catmull-Rom for a smooth silhouette
    // instead of a faceted polygon.
    const widthCtrl = [
      { x: -1.00, w: 0.00 },
      { x: -0.88, w: 0.035 },
      { x: -0.6, w: 0.10 },
      { x: -0.25, w: 0.20 },
      { x: 0.08, w: 0.26 },
      { x: 0.38, w: 0.235 },
      { x: 0.64, w: 0.155 },
      { x: 0.85, w: 0.07 },
      { x: 1.00, w: 0.00 },
    ];

    // Asymmetric colour blotches in local (x, y) body space — irregular,
    // offset placement is what makes this read as a koi pattern rather
    // than a barber-pole stripe.
    const blotches = paletteIndex % 2 === 0
      ? [
          { cx: 0.45, cy: 0.09, rx: 0.34, ry: 0.15, color: patchColor, seed: 3.1 },
          { cx: -0.05, cy: -0.13, rx: 0.28, ry: 0.12, color: spotColor, seed: 7.4 },
          { cx: -0.45, cy: 0.08, rx: 0.18, ry: 0.09, color: patchColor, seed: 11.2 },
        ]
      : [
          { cx: 0.5, cy: -0.08, rx: 0.3, ry: 0.14, color: patchColor, seed: 4.6 },
          { cx: 0.05, cy: 0.12, rx: 0.26, ry: 0.11, color: spotColor, seed: 9.8 },
          { cx: -0.4, cy: -0.07, rx: 0.2, ry: 0.1, color: patchColor, seed: 13.5 },
        ];

    const xSamples = 22;
    const ySamples = 9; // rows across the body width — enough resolution
                         // for patch edges to show some irregularity
    const rowFracs = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

    const baseX = new Float32Array(xSamples);
    const wobbleSeed = paletteIndex * 5.1 + 2.3;
    const baseW = new Float32Array(xSamples);
    for (let xi = 0; xi < xSamples; xi++) {
      const x = -1 + (2 * xi) / (xSamples - 1);
      baseX[xi] = x;
      // A small baked-in silhouette wobble (low-frequency, so it reads as
      // an organic irregularity rather than jitter) — real bodies aren't
      // a perfectly clean mathematical curve.
      const wobble =
        (Math.sin(x * 4.1 + wobbleSeed) * 0.6 + Math.sin(x * 7.3 + wobbleSeed * 1.7) * 0.4) * 0.014;
      baseW[xi] = Math.max(0, this._widthAt(x, widthCtrl) + wobble);
    }

    const vertCount = xSamples * ySamples;
    const positions = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const baseY = new Float32Array(vertCount); // undisplaced local y per vertex

    const tmpColor = new THREE.Color();
    for (let xi = 0; xi < xSamples; xi++) {
      const x = baseX[xi];
      const w = baseW[xi];
      for (let yi = 0; yi < ySamples; yi++) {
        const y = rowFracs[yi] * w;
        const vi = xi * ySamples + yi;
        baseY[vi] = y;

        positions[vi * 3] = x;
        positions[vi * 3 + 1] = y;
        positions[vi * 3 + 2] = 0;

        tmpColor.copy(bodyColor);
        blotches.forEach((b) => {
          // Perturb the effective radius with low-frequency noise so the
          // patch boundary is jagged/irregular rather than a clean ellipse.
          const angle = Math.atan2((y - b.cy) / b.ry, (x - b.cx) / b.rx);
          const edgeNoise = (Math.sin(angle * 3.1 + b.seed) * 0.5 + Math.sin(angle * 5.7 + b.seed * 1.4) * 0.5) * 0.18;
          const d = Math.sqrt(((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2);
          const influence = Math.max(0, Math.min(1, 1.6 - (d + edgeNoise) * 1.6));
          if (influence > 0) tmpColor.lerp(b.color, influence);
        });

        // Soft roundness shading: brighter along the centreline, gently
        // darker toward the edges — a cheap stand-in for real lighting
        // that keeps the body from reading as one flat plane of color.
        const edgeShade = w > 0.001 ? Math.abs(y / w) : 0;
        tmpColor.multiplyScalar(1 - edgeShade * 0.1);

        colors[vi * 3] = tmpColor.r;
        colors[vi * 3 + 1] = tmpColor.g;
        colors[vi * 3 + 2] = tmpColor.b;
      }
    }

    const indices = [];
    for (let xi = 0; xi < xSamples - 1; xi++) {
      for (let yi = 0; yi < ySamples - 1; yi++) {
        const a = xi * ySamples + yi;
        const b = a + 1;
        const cIdx = (xi + 1) * ySamples + yi;
        const d = cIdx + 1;
        indices.push(a, cIdx, b, b, cIdx, d);
      }
    }

    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    bodyGeo.setIndex(indices);

    const body = new THREE.Mesh(
      bodyGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
    );
    group.add(body);

    group.userData.bodyGeo = bodyGeo;
    group.userData.baseX = baseX;
    group.userData.baseW = baseW;
    group.userData.baseY = baseY;
    group.userData.xSamples = xSamples;
    group.userData.ySamples = ySamples;

    // Thin dark outline (top + bottom edge rows only) so the koi reads
    // clearly against any backdrop.
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.4 })
    );
    outline.position.z = 0.02;
    group.add(outline);
    group.userData.outline = outline;

    // Eyes — sit near the nose where the body wave is near-zero.
    [1, -1].forEach((side) => {
      const eye = new THREE.Mesh(
        new THREE.CircleGeometry(0.018, 10),
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
      );
      eye.position.set(0.78, side * 0.065, 0.15);
      group.add(eye);
    });

    // Pectoral fins — smooth curved teardrop, angled back near the head.
    [1, -1].forEach((side) => {
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.bezierCurveTo(-0.05, side * 0.06, -0.16, side * 0.14, -0.26, side * 0.24);
      finShape.bezierCurveTo(-0.17, side * 0.15, -0.07, side * 0.05, 0, 0);
      const fin = new THREE.Mesh(
        new THREE.ShapeGeometry(finShape),
        new THREE.MeshBasicMaterial({ color: c.body, transparent: true, opacity: 0.82, side: THREE.DoubleSide })
      );
      fin.position.set(0.42, side * 0.14, -0.05);
      group.add(fin);
    });

    // Tail fin — a proper forked caudal fin (two lobes + centre notch)
    // pivoted at the tail stalk, driven by the body wave's end phase
    // each frame so it reads as a continuation of the ripple.
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0.035);
    tailShape.bezierCurveTo(-0.14, 0.12, -0.24, 0.22, -0.34, 0.3);
    tailShape.bezierCurveTo(-0.26, 0.16, -0.24, 0.07, -0.18, 0.02);
    tailShape.bezierCurveTo(-0.24, -0.02, -0.26, -0.11, -0.34, -0.24);
    tailShape.bezierCurveTo(-0.24, -0.17, -0.14, -0.09, 0, -0.035);
    tailShape.closePath();
    const tailPivot = new THREE.Group();
    tailPivot.position.set(-0.98, 0, 0);
    const tail = new THREE.Mesh(
      new THREE.ShapeGeometry(tailShape),
      new THREE.MeshBasicMaterial({ color: c.body, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
    );
    tailPivot.add(tail);
    group.add(tailPivot);

    group.userData.tailPivot = tailPivot;

    // Soft water-glow disc beneath the koi — a cheap "displacing the
    // water" cue that reads as swimming in something rather than
    // floating on a blank background.
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({ color: 0xcdeaf5, transparent: true, opacity: 0.16, side: THREE.DoubleSide })
    );
    glow.position.z = -0.3;
    group.add(glow);
    group.userData.glow = glow;

    group.scale.setScalar(85);

    return group;
  }

  /* Traveling lateral wave — near-zero at the nose, growing toward the
     tail, animated over time. This is what makes it read as swimming
     rather than a rigid shape with a flapping tail. Every row in a given
     column shifts together, since lateral undulation translates the
     whole cross-section sideways rather than reshaping it. */
  _updateBodyWave(group, t, ampScale) {
    const { bodyGeo, baseX, baseW, baseY, xSamples, ySamples, outline, tailPivot } = group.userData;
    const positions = bodyGeo.attributes.position.array;

    const waveK = Math.PI * 1.15;
    const waveSpeed = 3.4;
    const amplitude = 0.1 * ampScale;

    const dys = new Float32Array(xSamples);
    for (let xi = 0; xi < xSamples; xi++) {
      const x = baseX[xi];
      const growth = Math.pow(Math.max(0, (1 - x) / 2), 1.3);
      dys[xi] = amplitude * growth * Math.sin(x * waveK - t * waveSpeed);

      for (let yi = 0; yi < ySamples; yi++) {
        const vi = xi * ySamples + yi;
        positions[vi * 3 + 1] = baseY[vi] + dys[xi];
      }
    }
    const tailDy = dys[0]; // baseX[0] is the tail stalk end

    const outlinePts = [];
    for (let xi = 0; xi < xSamples; xi++) outlinePts.push(new THREE.Vector3(baseX[xi], baseW[xi] + dys[xi], 0));
    for (let xi = xSamples - 1; xi >= 0; xi--) outlinePts.push(new THREE.Vector3(baseX[xi], -baseW[xi] + dys[xi], 0));

    bodyGeo.attributes.position.needsUpdate = true;
    outline.geometry.setFromPoints(outlinePts);

    // Tail fin follows the body wave's value at the tail, plus its own
    // faster flick on top for a livelier finish.
    tailPivot.rotation.z = tailDy * 2.2 + Math.sin(t * waveSpeed * 1.3) * 0.12 * ampScale;
  }

  _buildKoi() {
    this.rippleGeo = new THREE.RingGeometry(0.7, 1, 32);

    const count = 3;
    this.koi = [];
    for (let i = 0; i < count; i++) {
      const mesh = this._makeKoiMesh(i);
      this.scene.add(mesh);
      this.koi.push({
        mesh,
        phase: i / count,
        swimSeed: Math.random() * Math.PI * 2,
        bobSeed: Math.random() * Math.PI * 2,
        nextRipple: Math.random() * 2,
      });
    }
  }

  _spawnRipple(x, y, scale, color = 0xbfe6f2, opacity = 0.3) {
    const mesh = new THREE.Mesh(
      this.rippleGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })
    );
    mesh.position.set(x, y, -1);
    mesh.scale.setScalar(14 * scale);
    this.scene.add(mesh);
    this.ripples.push({ mesh, start: this.clock.elapsedTime, baseScale: 14 * scale });
  }

  // Warm gold/crimson burst at the leap's apex — the "breakthrough"
  // beat — a few rings fired in quick succession rather than one, so it
  // reads as a flash rather than a single ripple like the ambient ones.
  _spawnLeapBurst(x, y, scale) {
    [0, 0.1, 0.2, 0.32].forEach((delay, i) => {
      setTimeout(() => {
        if (!this.scene) return;
        this._spawnRipple(x, y, scale * (1.8 + i * 0.6), 0xf3c26a, 0.65);
      }, delay * 1000);
    });
  }

  _updateRipples(t) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const age = t - r.start;
      const duration = 2.4;
      if (age > duration) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.ripples.splice(i, 1);
        continue;
      }
      const p = age / duration;
      r.mesh.scale.setScalar(r.baseScale * (1 + p * 3.4));
      r.mesh.material.opacity = 0.3 * (1 - p);
    }
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._resize(), { passive: true });
    window.addEventListener('scroll', () => this._onScroll(), { passive: true });
    this._onScroll();

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
      this.prefersReducedMotion = e.matches;
    });
  }

  _onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const raw = max > 0 ? window.scrollY / max : 0;
    this.scrollProgress = Math.min(1, Math.max(0, raw));
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.viewW = w;
    this.viewH = h;

    this.renderer.setSize(w, h);
    this.camera.left = -w / 2;
    this.camera.right = w / 2;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.updateProjectionMatrix();
  }

  // Screen-space point (relative to viewport center, matching the units
  // the ambient swim path already uses) along the leap arc, lt in [0,1].
  _leapPoint(lt) {
    const startX = -this.viewW * 0.3;
    const startY = -this.viewH * 0.36;
    const endX = this.viewW * 0.26;
    const endY = this.viewH * 0.32;
    const x = startX + (endX - startX) * lt;
    const arc = Math.sin(Math.PI * lt) * this.viewH * 0.34;
    const y = startY + (endY - startY) * lt + arc;
    return { x, y };
  }

  _loop() {
    requestAnimationFrame(() => this._loop());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    const scrollYNow = window.scrollY;
    this._scrollDistance += Math.abs(scrollYNow - this._lastScrollY);
    this._lastScrollY = scrollYNow;

    // Zone detection. The koi-video section overlaps the hero in the DOM
    // (it uses a -100vh margin so its sticky pinning starts right as the
    // hero scrolls away), so its bounding rect alone can't tell "in the
    // hero" apart from "in the pond" — both read as "covering". Checking
    // the hero's own visibility first disambiguates them correctly.
    let targetOpacity = 1;
    let frontZone = true;
    if (this.heroSection && this.videoSection) {
      const heroRect = this.heroSection.getBoundingClientRect();
      const videoRect = this.videoSection.getBoundingClientRect();
      const heroVisible = heroRect.bottom > 0;
      const pondActive = !heroVisible && videoRect.bottom > 0;

      frontZone = heroVisible || pondActive;
      targetOpacity = pondActive ? 0 : 1; // hide only for the real video's moment
    }
    if (frontZone !== this.inFrontZone) {
      this.inFrontZone = frontZone;
      this.canvas.style.zIndex = frontZone ? '3' : '-1';
    }

    // Leap trigger: fires once per visit to the CTA zone, and re-arms
    // once the section scrolls out of view so it can play again if the
    // visitor scrolls back up and down past it.
    if (this.ctaSection) {
      const ctaRect = this.ctaSection.getBoundingClientRect();
      const ctaZone = ctaRect.top < this.viewH * 0.75 && ctaRect.bottom > this.viewH * 0.15;
      if (ctaZone && !this.leapTriggered) {
        this.leapTriggered = true;
        this.leapActive = true;
        this.leapT = 0;
        this.leapBurstFired = false;
      } else if (!ctaZone) {
        this.leapTriggered = false;
      }
    }

    this.canvasOpacity += (targetOpacity - this.canvasOpacity) * Math.min(1, dt * 4);
    this.canvas.style.opacity = this.canvasOpacity.toFixed(3);
    if (this.canvasOpacity < 0.01) {
      // Nothing visible — skip the render entirely.
      return;
    }

    // A full circuit every ~2.2 viewport-heights of scroll distance
    // travelled (not position — see _scrollDistance above), so the koi
    // keep actively swimming forward across a long page, in either
    // scroll direction, rather than settling near the bottom or
    // reversing when the visitor scrolls back up.
    const cycleHeight = this.viewH * 2.2;
    const scrollCycles = (this._scrollDistance % cycleHeight) / cycleHeight;

    // Idle drift so the school still feels alive when scroll is paused —
    // dampened heavily under reduced motion, never fully stopped.
    const idleSpeed = this.prefersReducedMotion ? 0.004 : 0.02;
    this._idleOffset = (this._idleOffset || 0) + dt * idleSpeed;

    const responsiveScale = this.viewW < 700 ? 0.62 : 1;
    const ampScale = this.prefersReducedMotion ? 0.25 : 1;

    // Advance the leap, if one is playing, once per frame (not per-koi).
    if (this.leapActive) {
      const leapSpeed = this.prefersReducedMotion ? 0.55 : 0.3;
      this.leapT += dt * leapSpeed;
      if (!this.leapBurstFired && this.leapT >= 0.5) {
        this.leapBurstFired = true;
        const apex = this._leapPoint(0.5);
        this._spawnLeapBurst(apex.x, apex.y, responsiveScale * 1.4);
      }
      if (this.leapT >= 1) {
        this.leapActive = false;
      }
    }

    this.koi.forEach((k, idx) => {
      const isLeaping = this.leapActive && idx === this.leapKoiIndex;

      if (isLeaping) {
        const lt = Math.min(1, this.leapT);
        const ahead = Math.min(1, lt + 0.02);
        const p = this._leapPoint(lt);
        const pAhead = this._leapPoint(ahead);

        k.mesh.position.set(p.x, p.y, 5);
        // A much bigger, more obvious size swell than the ambient bob —
        // this needs to read as "breaking from the school", not just a
        // slightly livelier swim.
        const leapScale = 85 * responsiveScale * (1 + Math.sin(Math.PI * lt) * 0.7);
        k.mesh.scale.setScalar(leapScale);
        k.mesh.rotation.z = Math.atan2(pAhead.y - p.y, pAhead.x - p.x);

        this._updateBodyWave(k.mesh, t * 1.8 + k.swimSeed, ampScale * 1.4);

        // Warm gold halo (color swap, not just brighter blue) so the
        // leaping koi is visually distinct from the ambient school, with
        // its own glow scaling up dramatically at the apex.
        const glow = k.mesh.userData.glow;
        glow.material.color.setHex(0xf3c26a);
        glow.material.opacity = 0.35 + Math.sin(Math.PI * lt) * 0.4;
        glow.scale.setScalar(1 + Math.sin(Math.PI * lt) * 1.8);
        return;
      }

      const progress = (scrollCycles + this._idleOffset + k.phase) % 1;
      const ahead = (progress + 0.01) % 1;

      const p = this.curve.getPointAt(progress);
      const pAhead = this.curve.getPointAt(ahead);

      const x = p.x * this.viewW * 0.5;
      const y = p.y * this.viewH * 0.5;
      const bobAmp = this.prefersReducedMotion ? 1.5 : 6;
      const bob = Math.sin(t * 0.6 + k.bobSeed) * bobAmp;

      k.mesh.position.set(x, y + bob, 0);
      k.mesh.scale.setScalar(85 * responsiveScale);

      const angle = Math.atan2(
        (pAhead.y - p.y) * this.viewH * 0.5,
        (pAhead.x - p.x) * this.viewW * 0.5
      );
      k.mesh.rotation.z = angle;

      this._updateBodyWave(k.mesh, t + k.swimSeed, ampScale);

      // Gentle glow pulse — a soft cue that the koi is displacing water.
      const glow = k.mesh.userData.glow;
      glow.material.opacity = 0.13 + Math.sin(t * 0.7 + k.bobSeed) * 0.04;

      // Periodic ripple ring expanding outward from the koi's position.
      if (t > k.nextRipple) {
        this._spawnRipple(x, y + bob, responsiveScale);
        k.nextRipple = t + 1.6 + Math.random() * 1.0;
      }
    });

    this._updateRipples(t);
    this.renderer.render(this.scene, this.camera);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.__koiScene = new KoiScene();
});
