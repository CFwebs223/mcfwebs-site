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

    // The scroll-koi video section owns the koi visual while it's on
    // screen — the ambient vector koi fade out over it and take over for
    // the rest of the page.
    this.videoSection = document.querySelector('.scroll-video');
    this.canvasOpacity = 0;

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

    // Traditional koi palettes: white body with red/orange + black
    // patches (kohaku / sanke-style) — kept simple and stylized.
    const palettes = [
      { body: 0xfdfaf3, patch: 0xd1442f, spot: 0x232323 },
      { body: 0xfaf6ec, patch: 0xe0672c, spot: 0x1c1c1c },
      { body: 0xf7f3e8, patch: 0xc93a2e, spot: 0x2a2a2a },
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
          { cx: 0.45, cy: 0.09, rx: 0.34, ry: 0.15, color: patchColor },
          { cx: -0.05, cy: -0.13, rx: 0.28, ry: 0.12, color: spotColor },
          { cx: -0.45, cy: 0.08, rx: 0.18, ry: 0.09, color: patchColor },
        ]
      : [
          { cx: 0.5, cy: -0.08, rx: 0.3, ry: 0.14, color: patchColor },
          { cx: 0.05, cy: 0.12, rx: 0.26, ry: 0.11, color: spotColor },
          { cx: -0.4, cy: -0.07, rx: 0.2, ry: 0.1, color: patchColor },
        ];

    const xSamples = 22;
    const ySamples = 5; // rows across the body width, incl. both edges
    const rowFracs = [-1, -0.55, 0, 0.55, 1];

    const baseX = new Float32Array(xSamples);
    const baseW = new Float32Array(xSamples);
    for (let xi = 0; xi < xSamples; xi++) {
      const x = -1 + (2 * xi) / (xSamples - 1);
      baseX[xi] = x;
      baseW[xi] = this._widthAt(x, widthCtrl);
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
          const d = Math.sqrt(((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2);
          const influence = Math.max(0, Math.min(1, 1.6 - d * 1.6));
          if (influence > 0) tmpColor.lerp(b.color, influence);
        });
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
      });
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

  _loop() {
    requestAnimationFrame(() => this._loop());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    // Fade out while the koi-video narrative covers the viewport.
    let targetOpacity = 1;
    if (this.videoSection) {
      const rect = this.videoSection.getBoundingClientRect();
      const covering = rect.top < this.viewH * 0.6 && rect.bottom > this.viewH * 0.4;
      targetOpacity = covering ? 0 : 1;
    }
    this.canvasOpacity += (targetOpacity - this.canvasOpacity) * Math.min(1, dt * 4);
    this.canvas.style.opacity = this.canvasOpacity.toFixed(3);
    if (this.canvasOpacity < 0.01) {
      // Nothing visible — skip the render entirely.
      return;
    }

    // A full circuit every ~2.2 viewport-heights of scroll, so the koi keep
    // actively swimming across a long page rather than settling near the
    // bottom for most of the scroll length.
    const cycleHeight = this.viewH * 2.2;
    const scrollCycles = (window.scrollY % cycleHeight) / cycleHeight;

    // Idle drift so the school still feels alive when scroll is paused —
    // dampened heavily under reduced motion, never fully stopped.
    const idleSpeed = this.prefersReducedMotion ? 0.004 : 0.02;
    this._idleOffset = (this._idleOffset || 0) + dt * idleSpeed;

    const responsiveScale = this.viewW < 700 ? 0.62 : 1;
    const ampScale = this.prefersReducedMotion ? 0.25 : 1;

    this.koi.forEach((k) => {
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
    });

    this.renderer.render(this.scene, this.camera);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.__koiScene = new KoiScene();
});
