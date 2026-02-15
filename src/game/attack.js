import * as THREE from "three";

// ================= INIT =================

export function initAttackState(ship) {
  ship.attackCooldown = THREE.MathUtils.randFloat(0, 1);
  ship.fireTimer = 0;
  ship.beam = null;
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

     // ONLY damage while beam exists
  if (ship.beam) {
    shield.takeDamage(getDamage(ship.type) * deltaSeconds);
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

  // Place beam midway between ship and shield in world space.
  beam.position.copy(startWorld).add(endWorld).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), // Cylinder points along local +Y
    direction.clone().normalize(),
  );

  // Add to same parent as ship so world transform is stable.
  ship.mesh.parent.add(beam);

  ship.beam = beam;
}

// ================= REMOVE BEAM =================

function removeBeam(ship) {
  if (!ship.beam) return;

  if (ship.beam.parent) {
    ship.beam.parent.remove(ship.beam);
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
}

// ================= DAMAGE =================

function getDamage(type) {
  if (type === 1) return 5;
  if (type === 2) return 12;
  if (type === 3) return 25;
  return 5;
}
