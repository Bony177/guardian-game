import * as THREE from "three";

// Global limit so shield doesn't melt instantly
let activeAttackers = 0;
const MAX_SIMULTANEOUS_ATTACKS = 2;

// Initialize attack properties on ship
export function initAttackState(ship) {
  ship.attackCooldown = THREE.MathUtils.randFloat(2, 4);
  ship.attackTimer = 0;
  ship.attackState = "idle"; // idle | charging | firing
  ship.beam = null;
}

// Update attack logic per frame
export function updateShipAttack(ship, delta, scene, shield) {
  if (ship.state !== "alive") return;

  // Cooldown ticking
  if (ship.attackState === "idle") {
    ship.attackCooldown -= delta / 1000;

    if (
      ship.attackCooldown <= 0 &&
      activeAttackers < MAX_SIMULTANEOUS_ATTACKS
    ) {
      ship.attackState = "charging";
      ship.attackTimer = 0.5; // charge time
      activeAttackers++;
    }
  }

  // Charging phase
  else if (ship.attackState === "charging") {
    ship.attackTimer -= delta / 1000;

    if (ship.attackTimer <= 0) {
      fireBeam(ship, scene, shield);
      ship.attackState = "firing";
      ship.attackTimer = 0.3; // beam duration
    }
  }

  // Firing phase
  else if (ship.attackState === "firing") {
    ship.attackTimer -= delta / 1000;

    if (ship.attackTimer <= 0) {
      removeBeam(ship, scene);
      ship.attackState = "idle";
      ship.attackCooldown = THREE.MathUtils.randFloat(2, 5);
      activeAttackers--;
    }
  }
}

// 🔥 Create beam visual + apply damage
function fireBeam(ship, scene, shield) {
  if (!ship.mesh) return;

  const start = ship.mesh.position.clone();
  const end = shield.object.position.clone();


  const direction = new THREE.Vector3()
    .subVectors(end, start);

  const length = direction.length();

  const geometry = new THREE.CylinderGeometry(0.08, 0.08, length, 8);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.9,
  });

  const beam = new THREE.Mesh(geometry, material);

  // Position beam between ship and shield
  const midpoint = new THREE.Vector3()
    .addVectors(start, end)
    .multiplyScalar(0.5);

  beam.position.copy(midpoint);

  // Rotate beam to face shield
  beam.lookAt(end);
  beam.rotateX(Math.PI / 2);

  scene.add(beam);

  ship.beam = beam;

  // 🔥 Apply shield damage here
  shield.takeDamage(getDamage(ship.type));
}

// Remove beam
function removeBeam(ship, scene) {
  if (ship.beam) {
    scene.remove(ship.beam);
    ship.beam.geometry.dispose();
    ship.beam.material.dispose();
    ship.beam = null;
  }
}

// Damage by ship type
function getDamage(type) {
  if (type === 1) return 5;   // Light
  if (type === 2) return 12;  // Medium
  if (type === 3) return 25;  // Heavy
  return 5;
}
