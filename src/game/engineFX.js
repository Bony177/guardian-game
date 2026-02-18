import * as THREE from "three";

const ENGINE_VISUAL = {
  radius: 0.03,
  color: 0xffaa33,
  emissive: 0xff6600,
  baseEmissiveIntensity: 1.2,
  flickerAmplitude: 0.2,
  flickerSpeed: 14,
  trailColor: 0xff8844,
  trailOpacity: 0.65,
  trailLife: 0.24,
  trailSpeed: 1.8,
  trailDrag: 1.4,
  trailSize: 0.085,
  emitInterval: 0.04,
};

// Manual local-space offsets by ship type.
// Tune these values to align each glow to the back engines of each model.
const ENGINE_OFFSETS_BY_TYPE = {
  1: [
    new THREE.Vector3(-0.3, -0.05, 0.12), // left engine
    new THREE.Vector3(-0.3, -0.05, -0.12), // right engine
  ],
  2: [
    new THREE.Vector3(-0.5, 0.02, 0.02), // left engine
    new THREE.Vector3(-0.4, 0.02, -0.15), // right engine
  ],
  3: [
    new THREE.Vector3(-0.45, 0.04, 0.25), // left engine
    new THREE.Vector3(-0.3, 0.03, -0.3), // right engine
  ],
};

function getEngineOffsets(type) {
  return ENGINE_OFFSETS_BY_TYPE[type] || ENGINE_OFFSETS_BY_TYPE[1];
}

function createEngineGlow() {
  const geometry = new THREE.SphereGeometry(ENGINE_VISUAL.radius, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: ENGINE_VISUAL.color,
    emissive: ENGINE_VISUAL.emissive,
    emissiveIntensity: ENGINE_VISUAL.baseEmissiveIntensity,
    toneMapped: false,
  });

  const glow = new THREE.Mesh(geometry, material);
  glow.userData.baseScale = 1;
  return glow;
}

function createTrailParticle() {
  const geometry = new THREE.SphereGeometry(ENGINE_VISUAL.trailSize, 8, 8);
  const material = new THREE.MeshBasicMaterial({
    color: ENGINE_VISUAL.trailColor,
    transparent: true,
    opacity: ENGINE_VISUAL.trailOpacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const particle = new THREE.Mesh(geometry, material);
  particle.renderOrder = 4;
  particle.userData.maxLife = ENGINE_VISUAL.trailLife;
  particle.userData.life = ENGINE_VISUAL.trailLife;
  particle.userData.velocity = new THREE.Vector3();
  return particle;
}

function emitTrailParticles(ship, scene) {
  if (!ship.engineGlows?.length || !ship.mesh || !scene) return;

  const worldQuat = new THREE.Quaternion();
  ship.mesh.getWorldQuaternion(worldQuat);

  const backward = new THREE.Vector3(-1, 0, 0).applyQuaternion(worldQuat).normalize();
  const lateral = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat).normalize();

  const worldPos = new THREE.Vector3();
  ship.engineGlows.forEach((glow) => {
    glow.getWorldPosition(worldPos);

    const particle = createTrailParticle();
    particle.position.copy(worldPos);

    const spread = THREE.MathUtils.randFloatSpread(0.45);
    particle.userData.velocity
      .copy(backward)
      .multiplyScalar(ENGINE_VISUAL.trailSpeed + THREE.MathUtils.randFloat(-0.25, 0.25))
      .addScaledVector(lateral, spread * 0.35);

    scene.add(particle);
    ship.engineTrails.push(particle);
  });
}

function updateTrailParticles(ship, delta) {
  if (!ship.engineTrails?.length) return;

  for (let i = ship.engineTrails.length - 1; i >= 0; i--) {
    const particle = ship.engineTrails[i];
    particle.userData.life -= delta;

    if (particle.userData.life <= 0) {
      if (particle.parent) particle.parent.remove(particle);
      if (particle.geometry) particle.geometry.dispose();
      if (particle.material) particle.material.dispose();
      ship.engineTrails.splice(i, 1);
      continue;
    }

    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.userData.velocity.multiplyScalar(ENGINE_VISUAL.trailDrag);

    const lifeRatio = particle.userData.life / particle.userData.maxLife;
    particle.material.opacity = ENGINE_VISUAL.trailOpacity * lifeRatio;
    particle.scale.setScalar(Math.max(0.3, lifeRatio));
  }
}

export function updateEngines(ship, delta, scene) {
  if (!ship.engineGlows) return;

  ship.engineTime += delta;
  ship.trailEmitTimer += delta;

  ship.engineGlows.forEach((glow, i) => {
    const flicker =
      ENGINE_VISUAL.baseEmissiveIntensity +
      Math.sin(ship.engineTime * ENGINE_VISUAL.flickerSpeed + i) *
        ENGINE_VISUAL.flickerAmplitude;
    glow.material.emissiveIntensity = flicker;
  });

  while (ship.trailEmitTimer >= ENGINE_VISUAL.emitInterval) {
    ship.trailEmitTimer -= ENGINE_VISUAL.emitInterval;
    emitTrailParticles(ship, scene);
  }

  updateTrailParticles(ship, delta);
}

export function spawnTrail(ship, scene) {
  const geometry = new THREE.SphereGeometry(0.15, 8, 8);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff5500,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });

  const puff = new THREE.Mesh(geometry, material);

  const worldPos = new THREE.Vector3();
  ship.mesh.getWorldPosition(worldPos);

  puff.position.copy(worldPos);
  scene.add(puff);

  puff.life = 0.5;

  return puff;
}

export function disposeEngines(ship) {
  if (ship.engineGlows?.length) {
    ship.engineGlows.forEach((glow) => {
      if (glow.parent) glow.parent.remove(glow);
      if (glow.geometry) glow.geometry.dispose();
      if (glow.material) glow.material.dispose();
    });
  }

  if (ship.engineTrails?.length) {
    ship.engineTrails.forEach((trail) => {
      if (trail.parent) trail.parent.remove(trail);
      if (trail.geometry) trail.geometry.dispose();
      if (trail.material) trail.material.dispose();
    });
  }

  ship.engineGlows = [];
  ship.engineTrails = [];
}

export function attachEngines(ship) {
  if (!ship.mesh) return;
  disposeEngines(ship);

  if (!ship.engineMount) {
    ship.engineMount = new THREE.Group();
    ship.mesh.add(ship.engineMount);
  } else if (ship.engineMount.parent !== ship.mesh) {
    ship.mesh.add(ship.engineMount);
  }

  ship.engineGlows = [];
  ship.engineTrails = [];
  const engineOffsets = getEngineOffsets(ship.type);

  engineOffsets.forEach((offset) => {
    const glow = createEngineGlow();
    glow.position.copy(offset);

    ship.engineMount.add(glow);
    ship.engineGlows.push(glow);
  });

  ship.engineTime = 0;
  ship.trailEmitTimer = 0;
}
