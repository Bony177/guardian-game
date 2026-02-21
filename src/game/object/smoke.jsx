import * as THREE from "three";

function toVector3(position) {
  if (position?.isVector3) return position.clone();
  if (!position || typeof position !== "object") return new THREE.Vector3();
  return new THREE.Vector3(position.x || 0, position.y || 0, position.z || 0);
}

export function createChimneySmoke(scene, options = {}) {
  const normalizedOptions = options?.isVector3 ? { position: options } : options;
  let baseOpacity = THREE.MathUtils.clamp(normalizedOptions.opacity ?? 0.05, 0, 1);
  let speedMultiplier = Math.max(normalizedOptions.speed ?? 1, 0.01);
  const spawnRate = Math.max(Math.floor(normalizedOptions.spawnRate ?? 3), 0);
  const maxParticles = Math.max(Math.floor(normalizedOptions.maxParticles ?? 250), 1);
  const fadeSpeed = Math.max(normalizedOptions.fadeSpeed ?? 0.0002, 0);

  const smokeGroup = new THREE.Group();
  smokeGroup.position.copy(toVector3(normalizedOptions.position));
  scene.add(smokeGroup);

  const textureLoader = new THREE.TextureLoader();
  const smokeTexture = textureLoader.load("/textures/smoke.png");

  const particles = [];

  function createParticle() {
    const material = new THREE.SpriteMaterial({
      map: smokeTexture,
      transparent: true,
      opacity: baseOpacity,
      color: new THREE.Color(0xf5f5f2),
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);

    sprite.position.set(
      (Math.random() - 0.5) * 0.1,
      0,
      (Math.random() - 0.5) * 0.1,
    );

    sprite.scale.set(0.35, 0.35, 0.35);

    sprite.userData = {
      speed: (0.015 + Math.random() * 0.015) * speedMultiplier,
      driftX: ((Math.random() - 0.5) * 0.01) * speedMultiplier,
      driftZ: ((Math.random() - 0.5) * 0.01) * speedMultiplier,
      grow: 1.005 + Math.random() * 0.002,
    };

    smokeGroup.add(sprite);
    particles.push(sprite);
  }

  function update() {
    // Spawn new particles
    for (let i = 0; i < spawnRate; i++) {
      if (particles.length < maxParticles) {
        createParticle();
      }
    }

    // Update existing particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.position.y += p.userData.speed;
      p.position.x += p.userData.driftX;
      p.position.z += p.userData.driftZ;

      const maxScale = 0.8; // maximum width
      const baseScale = 0.28; // starting width
      const heightFactor = p.position.y * 0.18;

      let newScale = baseScale + heightFactor;

      // clamp so it never becomes huge
      newScale = Math.min(newScale, maxScale);

      p.scale.set(newScale, newScale * 1.4, newScale);
      p.material.opacity -= fadeSpeed * speedMultiplier;

      // Remove dead particles
      if (p.material.opacity <= 0) {
        smokeGroup.remove(p);
        p.material.dispose();
        particles.splice(i, 1);
      }
    }
  }

  function setOpacity(nextOpacity) {
    baseOpacity = THREE.MathUtils.clamp(nextOpacity, 0, 1);
  }

  function setSpeed(nextSpeed) {
    speedMultiplier = Math.max(nextSpeed, 0.01);
  }

  function setPosition(nextPosition) {
    smokeGroup.position.copy(toVector3(nextPosition));
  }

  return { update, object: smokeGroup, setOpacity, setSpeed, setPosition };
}
