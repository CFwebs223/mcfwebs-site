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

  /* Body outline sampled along its length, nose (x=1) to tail stalk
     (x=-1). `band` assigns each cross-section a colour band so the
     patches ripple with the body instead of floating on top of it. */
  _bodyProfile() {
    return [
      { x: 1.00, w: 0.00, band: 'body' },
      { x: 0.90, w: 0.17, band: 'body' },
      { x: 0.74, w: 0.27, band: 'body' },
      { x: 0.52, w: 0.31, band: 'patch' },
      { x: 0.28, w: 0.30, band: 'patch' },
      { x: 0.04, w: 0.27, band: 'body' },
      { x: -0.22, w: 0.23, band: 'spot' },
      { x: -0.46, w: 0.18, band: 'spot' },
      { x: -0.66, w: 0.12, band: 'body' },
      { x: -0.84, w: 0.06, band: 'body' },
      { x: -0.97, w: 0.02, band: 'body' },
    ];
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
    const colorFor = { body: new THREE.Color(c.body), patch: new THREE.Color(c.patch), spot: new THREE.Color(c.spot) };

    const profile = this._bodyProfile();
    const n = profile.length;

    // Two vertices (top/bottom) per profile sample.
    const positions = new Float32Array(n * 2 * 3);
    const colors = new Float32Array(n * 2 * 3);
    const baseX = new Float32Array(n);
    const baseW = new Float32Array(n);

    profile.forEach((p, i) => {
      baseX[i] = p.x;
      baseW[i] = p.w;
      const col = colorFor[p.band];
      const ti = i * 2 * 3;
      positions[ti] = p.x; positions[ti + 1] = p.w; positions[ti + 2] = 0;
      positions[ti + 3] = p.x; positions[ti + 4] = -p.w; positions[ti + 5] = 0;
      colors[ti] = col.r; colors[ti + 1] = col.g; colors[ti + 2] = col.b;
      colors[ti + 3] = col.r; colors[ti + 4] = col.g; colors[ti + 5] = col.b;
    });

    const indices = [];
    for (let i = 0; i < n - 1; i++) {
      const top0 = i * 2, bot0 = i * 2 + 1, top1 = (i + 1) * 2, bot1 = (i + 1) * 2 + 1;
      indices.push(top0, bot0, top1, bot0, bot1, top1);
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

    // Thin dark outline so the koi reads clearly against any backdrop.
    const outline = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.4 })
    );
    outline.position.z = 0.02;
    group.add(outline);
    group.userData.outline = outline;

    // Eyes — sit near the nose where the body wave is near-zero, so they
    // don't need to deform with it.
    [1, -1].forEach((side) => {
      const eye = new THREE.Mesh(
        new THREE.CircleGeometry(0.02, 10),
        new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
      );
      eye.position.set(0.82, side * 0.09, 0.15);
      group.add(eye);
    });

    // Pectoral fins — small, angled near the head.
    [1, -1].forEach((side) => {
      const finShape = new THREE.Shape();
      finShape.moveTo(0, 0);
      finShape.quadraticCurveTo(-0.05, side * 0.18, -0.2, side * 0.2);
      finShape.quadraticCurveTo(-0.08, side * 0.06, 0, 0);
      const fin = new THREE.Mesh(
        new THREE.ShapeGeometry(finShape),
        new THREE.MeshBasicMaterial({ color: c.body, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
      );
      fin.position.set(0.5, side * 0.2, -0.05);
      group.add(fin);
    });

    // Tail fin — pivoted at the tail stalk, driven by the body wave's
    // end phase each frame so it reads as a continuation of the ripple.
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0.03);
    tailShape.lineTo(-0.32, 0.22);
    tailShape.lineTo(-0.22, 0);
    tailShape.lineTo(-0.32, -0.22);
    tailShape.lineTo(0, -0.03);
    tailShape.closePath();
    const tailPivot = new THREE.Group();
    tailPivot.position.set(-0.97, 0, 0);
    const tail = new THREE.Mesh(
      new THREE.ShapeGeometry(tailShape),
      new THREE.MeshBasicMaterial({ color: c.body, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
    );
    tailPivot.add(tail);
    group.add(tailPivot);

    group.userData.tailPivot = tailPivot;
    group.scale.setScalar(75);

    return group;
  }

  /* Traveling lateral wave — near-zero at the nose, growing toward the
     tail, animated over time. This is what makes it read as swimming
     rather than a rigid shape with a flapping tail. */
  _updateBodyWave(group, t, ampScale) {
    const { bodyGeo, baseX, baseW, outline, tailPivot } = group.userData;
    const positions = bodyGeo.attributes.position.array;
    const n = baseX.length;

    const waveK = Math.PI * 1.15;
    const waveSpeed = 3.4;
    const amplitude = 0.09 * ampScale;

    const dys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = baseX[i];
      const growth = Math.pow(Math.max(0, (1 - x) / 2), 1.3);
      const dy = amplitude * growth * Math.sin(x * waveK - t * waveSpeed);
      dys[i] = dy;

      const ti = i * 2 * 3;
      positions[ti + 1] = baseW[i] + dy;
      positions[ti + 4] = -baseW[i] + dy;
    }
    const tailDy = dys[n - 1];

    const outlinePts = [];
    for (let i = 0; i < n; i++) outlinePts.push(new THREE.Vector3(baseX[i], baseW[i] + dys[i], 0));
    for (let i = n - 1; i >= 0; i--) outlinePts.push(new THREE.Vector3(baseX[i], -baseW[i] + dys[i], 0));

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
      k.mesh.scale.setScalar(75 * responsiveScale);

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
