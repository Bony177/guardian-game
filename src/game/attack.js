import * as THREE from "three";

// Initialize attack properties on ship
export function initAttackState(ship) {
  ship.attackCooldown = THREE.MathUtils.randFloat(2, 4); // time until next shot
  ship.fireTimer = 0;                                    // how long beam stays
  ship.beam = null;                                       // beam reference
}

// Update attack logic per frame
export function updateShipAttack(ship, delta, scene, shield) {
  if (!ship.mesh || ship.state !== "alive") {
    removeBeam(ship, scene);
    return;
  }

  const deltaSeconds = delta / 1000;

  // If beam is currently active
  if (ship.beam) {
    ship.fireTimer -= deltaSeconds;

    if (ship.fireTimer <= 0) {
      removeBeam(ship, scene);
      ship.attackCooldown = THREE.MathUtils.randFloat(2, 5);
    }

    return; // Don't process cooldown while firing
  }

  // Cooldown ticking
  ship.attackCooldown -= deltaSeconds;

  if (ship.attackCooldown <= 0) {
    fireBeam(ship, scene, shield);
    ship.fireTimer = 0.3; // beam visible duration
  }
}

// Create beam visual + apply damage

function fireBeam(ship, scene, shield) {
  if (ship.beam) return;

  if (!ship.mesh) return;

  const start = ship.mesh.position.clone();
  const end = shield.object.position.clone();

  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();

  const geometry = new THREE.CylinderGeometry(0.08, 0.08, length, 8);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.9,
  });

  const beam = new THREE.Mesh(geometry, material);

  const midpoint = new THREE.Vector3()
    .addVectors(start, end)
    .multiplyScalar(0.5);

  beam.position.copy(midpoint);
  beam.lookAt(end);
  beam.rotateX(Math.PI / 2);

  scene.add(beam);

  ship.beam = beam;

  // Apply shield damage
  shield.takeDamage(getDamage(ship.type));
}

// Remove beam safely
function removeBeam(ship, scene) {
  if (!ship.beam) return;

  scene.remove(ship.beam);

  if (ship.beam.geometry) ship.beam.geometry.dispose();
  if (ship.beam.material) {
    if (Array.isArray(ship.beam.material)) {
      ship.beam.material.forEach(m => m.dispose());
    } else {
      ship.beam.material.dispose();
    }
  }

  ship.beam = null;
}

// Damage by ship type
function getDamage(type) {
  if (type === 1) return 5;
  if (type === 2) return 12;
  if (type === 3) return 25;
  return 5;
}
