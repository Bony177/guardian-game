import * as THREE from "three";

const ENGINE_VISUAL = {
  radius: 0.07,
  color: 0xffaa33,
  emissive: 0xff6600,
  opacity: 0.6,
  baseEmissiveIntensity: 1.7,
  flickerAmplitude: 0.5,
  flickerSpeed: 12,
  pulseAmplitude: 0.08,
  pulseSpeed: 9,
};

// Manual local-space offsets by ship type.
// Tune these values to align each glow to the back engines of each model.
const ENGINE_OFFSETS_BY_TYPE = {
  1: [
    new THREE.Vector3(-0.3, -0.05, 0.12), // left engine
    new THREE.Vector3,(-0.3, -0.05, -0.12), // right engine
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

export function updateEngines(ship, delta) {
  if (!ship.engineGlows) return;

  ship.engineTime += delta;

  ship.engineGlows.forEach((glow, i) => {
    const flicker =
      ENGINE_VISUAL.baseEmissiveIntensity +
      Math.sin(ship.engineTime * ENGINE_VISUAL.flickerSpeed + i) *
        ENGINE_VISUAL.flickerAmplitude;
    glow.material.emissiveIntensity = flicker;

    const pulse =
      glow.userData.baseScale +
      Math.sin(ship.engineTime * ENGINE_VISUAL.pulseSpeed + i) *
        ENGINE_VISUAL.pulseAmplitude;
    glow.scale.setScalar(pulse);
  });
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


export function attachEngines(ship) {
  if (!ship.mesh) return;
  if (ship.engineGlows?.length) {
    ship.engineGlows.forEach((glow) => {
      if (glow.parent) glow.parent.remove(glow);
      if (glow.geometry) glow.geometry.dispose();
      if (glow.material) glow.material.dispose();
    });
  }

  if (!ship.engineMount) {
    ship.engineMount = new THREE.Group();
    ship.mesh.add(ship.engineMount);
  } else if (ship.engineMount.parent !== ship.mesh) {
    ship.mesh.add(ship.engineMount);
  }

  ship.engineGlows = [];
  const engineOffsets = getEngineOffsets(ship.type);

  engineOffsets.forEach((offset) => {
    const glow = createEngineGlow();
    glow.position.copy(offset);

    ship.engineMount.add(glow);
    ship.engineGlows.push(glow);
  });

  ship.engineTime = 0;
}
