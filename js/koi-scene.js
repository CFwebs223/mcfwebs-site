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

  _makeKoiMesh(paletteIndex) {
    const group = new THREE.Group();

    // Traditional koi palettes: white body with red/orange (kohaku) or
    // black+orange (showa-ish) patches — kept simple and stylized.
    const palettes = [
      { body: 0xfdfaf3, patch: 0xd1442f, spot: 0x1c1c1c },
      { body: 0xfaf6ec, patch: 0xe0672c, spot: 0x222222 },
      { body: 0xf7f3e8, patch: 0xc93a2e, spot: 0x2a2a2a },
    ];
    const c = palettes[paletteIndex % palettes.length];

    // Body — a simple teardrop silhouette via a Shape.
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(0, 16);
    bodyShape.bezierCurveTo(10, 15, 15, 6, 15, 0);
    bodyShape.bezierCurveTo(15, -7, 9, -15, -2, -18);
    bodyShape.bezierCurveTo(-10, -15, -14, -6, -14, 0);
    bodyShape.bezierCurveTo(-14, 6, -9, 15, 0, 16);
    const bodyGeo = new THREE.ShapeGeometry(bodyShape);
    const bodyMat = new THREE.MeshBasicMaterial({ color: c.body, side: THREE.DoubleSide });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(body);

    // Thin dark outline so the koi reads against any backdrop.
    const outlineGeo = new THREE.EdgesGeometry(bodyGeo);
    const outline = new THREE.LineSegments(
      outlineGeo,
      new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.35 })
    );
    outline.position.z = 0.05;
    group.add(outline);

    // Colour patches (simple blobs).
    const patchShape1 = new THREE.Shape();
    patchShape1.absarc(3, 6, 6, 0, Math.PI * 2, false);
    const patch1 = new THREE.Mesh(
      new THREE.ShapeGeometry(patchShape1),
      new THREE.MeshBasicMaterial({ color: c.patch, side: THREE.DoubleSide })
    );
    patch1.position.z = 0.1;
    group.add(patch1);

    const patchShape2 = new THREE.Shape();
    patchShape2.absarc(-4, -6, 5, 0, Math.PI * 2, false);
    const patch2 = new THREE.Mesh(
      new THREE.ShapeGeometry(patchShape2),
      new THREE.MeshBasicMaterial({ color: c.spot, side: THREE.DoubleSide })
    );
    patch2.position.z = 0.1;
    group.add(patch2);

    // Tail fin — a separate mesh pivoted at the body's rear so it can wave.
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 5);
    tailShape.lineTo(14, 10);
    tailShape.lineTo(10, 0);
    tailShape.lineTo(14, -10);
    tailShape.lineTo(0, -5);
    tailShape.closePath();
    const tailPivot = new THREE.Group();
    tailPivot.position.set(-14, 0, 0);
    const tail = new THREE.Mesh(
      new THREE.ShapeGeometry(tailShape),
      new THREE.MeshBasicMaterial({ color: c.body, side: THREE.DoubleSide, transparent: true, opacity: 0.92 })
    );
    tail.position.x = -1;
    tailPivot.add(tail);
    group.add(tailPivot);

    group.userData.tailPivot = tailPivot;
    group.scale.setScalar(1.4);

    return group;
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

    // A full circuit every ~2.2 viewport-heights of scroll, so the koi keep
    // actively swimming across a long page rather than settling near the
    // bottom for most of the scroll length.
    const cycleHeight = this.viewH * 2.2;
    const scrollCycles = (window.scrollY % cycleHeight) / cycleHeight;

    // Idle drift so the school still feels alive when scroll is paused —
    // dampened heavily under reduced motion, never fully stopped.
    const idleSpeed = this.prefersReducedMotion ? 0.004 : 0.02;
    this._idleOffset = (this._idleOffset || 0) + dt * idleSpeed;

    const minScale = this.viewW < 700 ? 0.5 : 0.85;

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
      k.mesh.scale.setScalar(minScale);

      const angle = Math.atan2(
        (pAhead.y - p.y) * this.viewH * 0.5,
        (pAhead.x - p.x) * this.viewW * 0.5
      );
      k.mesh.rotation.z = angle;

      // Gentle tail wag, independent of scroll — the "still alive" cue.
      const wagAmp = this.prefersReducedMotion ? 0.08 : 0.35;
      const wagSpeed = this.prefersReducedMotion ? 1.2 : 3.2;
      k.mesh.userData.tailPivot.rotation.z = Math.sin(t * wagSpeed + k.swimSeed) * wagAmp;
    });

    this.renderer.render(this.scene, this.camera);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.__koiScene = new KoiScene();
});
