/* ==========================================================================
   Ink Hover — real, animated, 3D ink drops falling from hovered text.

   The previous two attempts used an SVG filter — fundamentally a 2D
   trick with a fake bump-mapped highlight, which is why it kept reading
   as flat/2D no matter how it was tuned. This version uses actual
   Three.js geometry (already loaded on this page for the koi): real
   sphere/droplet meshes with a physical, glossy material lit by a real
   scene light, animated falling with gravity and squash/stretch — a
   genuine 3D object, not a filtered image.

   Ink colour inverts against the hovered text: dark/ink text drips red,
   red/crimson text drips translucent black.
   ========================================================================== */

(function () {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof THREE === 'undefined') return;

  const TEXT_SELECTOR =
    'h1, h2, h3, h4, h5, h6, p, a, span, li, label, button, blockquote, dt, dd, td, th, div';

  const canvas = document.createElement('canvas');
  canvas.id = 'ink-3d-canvas';
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();

  // Screen-space orthographic camera: world (x,y) maps 1:1 to viewport
  // pixels with y increasing downward, so DOM coordinates (clientX/Y)
  // can be used directly as drop positions with no conversion.
  let viewW = window.innerWidth;
  let viewH = window.innerHeight;
  const camera = new THREE.OrthographicCamera(0, viewW, 0, viewH, 0.1, 1000);
  camera.position.z = 100;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.PointLight(0xffffff, 1.4, 2000);
  keyLight.position.set(-150, -400, 260);
  scene.add(keyLight);
  const rimLight = new THREE.PointLight(0xffffff, 0.4, 2000);
  rimLight.position.set(300, 200, 200);
  scene.add(rimLight);

  function resize() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    renderer.setSize(viewW, viewH);
    camera.right = viewW;
    camera.bottom = viewH;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize, { passive: true });
  resize();

  const dropGeometry = new THREE.SphereGeometry(1, 18, 18);
  const drops = [];

  function spawnDrop(x, y, color) {
    const material = new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.22,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      transparent: true,
      opacity: 0.95,
    });
    const mesh = new THREE.Mesh(dropGeometry, material);
    const size = 4.5 + Math.random() * 3.5;
    mesh.position.set(x, y, 0);
    mesh.scale.set(size, size, size);
    scene.add(mesh);

    drops.push({
      mesh,
      vy: 20 + Math.random() * 20,
      age: 0,
      life: 1.3 + Math.random() * 0.5,
      baseSize: size,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 4 + Math.random() * 2,
    });
  }

  let running = false;
  const clock = new THREE.Clock();

  function tick() {
    if (drops.length === 0) {
      running = false;
      return;
    }
    requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.age += dt;

      // Gravity + gentle horizontal sway as it falls, like a real drip.
      d.vy += 340 * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.x += Math.sin(d.age * d.swaySpeed + d.swayPhase) * 6 * dt;

      // Squash/stretch: elongates vertically as it picks up speed,
      // tapers as it nears the end of its life.
      const p = Math.min(1, d.age / d.life);
      const stretch = 1 + Math.min(d.vy / 90, 1.6);
      const shrink = Math.max(0, 1 - p * p);
      d.mesh.scale.set(
        d.baseSize * shrink * (1 - p * 0.25),
        d.baseSize * shrink * stretch,
        d.baseSize * shrink
      );
      d.mesh.material.opacity = 0.95 * shrink;

      if (p >= 1) {
        scene.remove(d.mesh);
        d.mesh.material.dispose();
        drops.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  }

  function ensureRunning() {
    if (running) return;
    running = true;
    clock.start();
    tick();
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

  const lastSpawn = new WeakMap();
  const SPAWN_INTERVAL = 220;

  document.addEventListener(
    'mousemove',
    (e) => {
      const el = findTextTarget(e.target);
      if (!el) return;

      const now = performance.now();
      const last = lastSpawn.get(el) || 0;
      if (now - last < SPAWN_INTERVAL) return;
      lastSpawn.set(el, now);

      const reddish = isReddish(getComputedStyle(el).color);
      const color = reddish ? 0x1a1a1a : 0xbc002d;
      const rect = el.getBoundingClientRect();
      // Spawn near the cursor but biased toward the text's own baseline
      // area, so drops read as coming off the letters, not the pointer.
      const y = Math.min(e.clientY, rect.bottom - rect.height * 0.15);

      spawnDrop(e.clientX, y, color);
      ensureRunning();
    },
    { passive: true }
  );
})();
