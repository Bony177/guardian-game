import * as THREE from "three";

const ELECTRIC_BEAM = {
  segments: 20,
  amplitude: 0.13,
  opacity: 0.65,
  pulseSpeed: 18,
  flickerSpeed: 32,
};

// ================= INIT =================

export function initAttackState(ship) {
  ship.attackCooldown = THREE.MathUtils.randFloat(0, 1);
  ship.fireTimer = 0;
  ship.beam = null;
  ship.beamFxTime = 0;
  ship.isFiring = false;
}

// Safety guard
function ensureAttackState(ship) {
  if (typeof ship.attackCooldown !== "number") {
    ship.attackCooldown = 0;
  }

  if (typeof ship.fireTimer !== "number") {
    ship.fireTimer = 0;
  }

  if (!Object.prototype.hasOwnProperty.call(ship, "beam")) {
    ship.beam = null;
  }

  if (typeof ship.beamFxTime !== "number") {
    ship.beamFxTime = 0;
  }

  if (!Object.prototype.hasOwnProperty.call(ship, "isFiring")) {
    ship.isFiring = false;
  }
}


// ================= UPDATE =================

export function updateShipAttack(ship, delta, shield) {
  ensureAttackState(ship);
 

  // If ship not alive → remove beam completely
  if (!ship.mesh || ship.state !== "alive") {
    removeBeam(ship);
    return;
  }

  const deltaSeconds = delta / 1000;

  // Do not fire while the movement state machine says the ship is moving.
  // `moveDir` is always non-zero for most ships, so it cannot be used as a moving check.
  const isMoving = ship.isMoving === true;

  if (isMoving) {
  removeBeam(ship);
  ship.isFiring = false;
  ship.fireTimer = 0;
  return;
}


  // If currently firing
  if (ship.isFiring) {
    ship.fireTimer -= deltaSeconds;
    ship.beamFxTime += deltaSeconds;

     // ONLY damage while beam exists
  if (ship.beam) {
    shield.takeDamage(getDamage(ship.type) * deltaSeconds);
    updateElectricBeam(ship.beam, ship.beamFxTime);
  }

    if (ship.fireTimer <= 0) {
      removeBeam(ship);
      ship.attackCooldown = THREE.MathUtils.randFloat(2, 4);
      ship.isFiring = false;
    }

    return;
  }

  // Cooldown ticking
  ship.attackCooldown -= deltaSeconds;

  if (ship.attackCooldown <= 0) {
    createBeam(ship, shield);
   // 🔴 GLOW ON STRIKE (only once)
  shield.material.emissive.set(0xff0000);
  shield.material.emissiveIntensity = 3.0;
  shield.hitFlashTimer = 0.15;

  ship.fireTimer = 0.6;
  ship.isFiring = true;

    
  }
}

// ================= CREATE BEAM =================

function createBeam(ship, shield) {
  if (ship.beam) return;
  if (!ship.mesh) return;
  if (!ship.mesh.parent) return;

  const startWorld = ship.mesh.getWorldPosition(new THREE.Vector3());
  const endWorld = shield.object.getWorldPosition(new THREE.Vector3());
  const direction = new THREE.Vector3().subVectors(endWorld, startWorld);
  const length = direction.length();
  if (length <= 0.001) return;

  // Create thin laser
  const geometry = new THREE.CylinderGeometry(0.06, 0.06, length, 6);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });

  const beam = new THREE.Mesh(geometry, material);
  beam.renderOrder = 10;
  attachElectricOverlay(beam, length);

  // Place beam midway between ship and shield in world space.
  beam.position.copy(startWorld).add(endWorld).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), // Cylinder points along local +Y
    direction.clone().normalize(),
  );

  // Add to same parent as ship so world transform is stable.
  ship.mesh.parent.add(beam);

  ship.beam = beam;
  ship.beamFxTime = 0;
}

function attachElectricOverlay(beam, length) {
  const segmentCount = ELECTRIC_BEAM.segments;
  const points = new Float32Array((segmentCount + 1) * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute("position", new THREE.BufferAttribute(points, 3));

  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0xff2a2a,
    transparent: true,
    opacity: ELECTRIC_BEAM.opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const electricLine = new THREE.Line(lineGeometry, lineMaterial);
  electricLine.renderOrder = 11;
  beam.add(electricLine);

  const phaseOffsets = Array.from({ length: segmentCount + 1 }, () =>
    THREE.MathUtils.randFloat(0, Math.PI * 2),
  );

  beam.userData.electricBeam = {
    line: electricLine,
    points,
    segmentCount,
    length,
    phaseOffsets,
    flickerOffset: THREE.MathUtils.randFloat(0, Math.PI * 2),
  };

  updateElectricBeam(beam, 0);
}

function updateElectricBeam(beam, elapsed) {
  const fx = beam?.userData?.electricBeam;
  if (!fx) return;

  const halfLength = fx.length * 0.5;

  for (let i = 0; i <= fx.segmentCount; i++) {
    const t = i / fx.segmentCount;
    const y = -halfLength + t * fx.length;
    const envelope = Math.sin(Math.PI * t);
    const amp = ELECTRIC_BEAM.amplitude * envelope;
    const phase = fx.phaseOffsets[i];

    const x =
      (Math.sin(elapsed * ELECTRIC_BEAM.pulseSpeed + phase * 2.1) * 0.7 +
        Math.sin(elapsed * (ELECTRIC_BEAM.pulseSpeed * 2.4) + phase) * 0.3) *
      amp;
    const z =
      (Math.cos(elapsed * (ELECTRIC_BEAM.pulseSpeed * 1.7) + phase * 1.3) * 0.7 +
        Math.sin(elapsed * (ELECTRIC_BEAM.pulseSpeed * 2.8) + phase * 0.6) * 0.3) *
      amp;

    const idx = i * 3;
    fx.points[idx] = x;
    fx.points[idx + 1] = y;
    fx.points[idx + 2] = z;
  }

  fx.line.geometry.attributes.position.needsUpdate = true;
  fx.line.material.opacity =
    ELECTRIC_BEAM.opacity +
    Math.sin(elapsed * ELECTRIC_BEAM.flickerSpeed + fx.flickerOffset) * 0.2;
}

// ================= REMOVE BEAM =================

function removeBeam(ship) {
  if (!ship.beam) return;

  if (ship.beam.parent) {
    ship.beam.parent.remove(ship.beam);
  }

  const electricLine = ship.beam.userData?.electricBeam?.line;
  if (electricLine) {
    if (electricLine.geometry) electricLine.geometry.dispose();
    if (electricLine.material) electricLine.material.dispose();
  }

  if (ship.beam.geometry) {
    ship.beam.geometry.dispose();
  }

  if (ship.beam.material) {
    if (Array.isArray(ship.beam.material)) {
      ship.beam.material.forEach(m => m.dispose());
    } else {
      ship.beam.material.dispose();
    }
  }

  ship.beam = null;
  ship.beamFxTime = 0;
}

// ================= DAMAGE =================

function getDamage(type) {
  if (type === 1) return 5;
  if (type === 2) return 12;
  if (type === 3) return 25;
  return 5;
}
