/* ==========================================================================
   Capability Cards — tilt-on-hover 3D effect + a small live Three.js
   scene in the "Interactive 3D / WebGL" card, so that one claim is
   demonstrated rather than just stated.
   ========================================================================== */

(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Tilt effect ----
  if (!prefersReducedMotion) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      const inner = card.querySelector('.capability-card-inner');
      if (!inner) return;

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width;
        const py = (e.clientY - rect.top) / rect.height;
        const rx = (py - 0.5) * -8;
        const ry = (px - 0.5) * 8;
        inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) translateZ(4px)`;
        inner.style.setProperty('--glare-x', `${px * 100}%`);
        inner.style.setProperty('--glare-y', `${py * 100}%`);
      });

      card.addEventListener('mouseleave', () => {
        inner.style.transform = 'rotateX(0deg) rotateY(0deg)';
      });
    });
  }

  // ---- Live mini WebGL scene ----
  const canvas = document.getElementById('capability-3d-canvas');
  if (!canvas || typeof THREE === 'undefined' || prefersReducedMotion) return;

  const container = canvas.parentElement;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 4);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const geometry = new THREE.IcosahedronGeometry(1.2, 0);
  const material = new THREE.MeshBasicMaterial({ color: 0xbc002d, wireframe: true, transparent: true, opacity: 0.8 });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const innerGeometry = new THREE.IcosahedronGeometry(0.6, 0);
  const innerMaterial = new THREE.MeshBasicMaterial({ color: 0x1a1a1a, wireframe: true, transparent: true, opacity: 0.25 });
  const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
  scene.add(innerMesh);

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  let running = false;
  let frameId = null;
  const clock = new THREE.Clock();

  function animate() {
    if (!running) return;
    frameId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    mesh.rotation.x = t * 0.35;
    mesh.rotation.y = t * 0.5;
    innerMesh.rotation.x = -t * 0.25;
    innerMesh.rotation.y = -t * 0.4;
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    resize();
    clock.start();
    animate();
  }

  function stop() {
    running = false;
    if (frameId) cancelAnimationFrame(frameId);
  }

  window.addEventListener('resize', resize, { passive: true });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => (entry.isIntersecting ? start() : stop())),
      { threshold: 0.15 }
    );
    observer.observe(container);
  } else {
    start();
  }
})();
