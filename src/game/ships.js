// ships.js
import * as THREE from "three";

// ================= CONFIG =================
const SHIELD_CENTER = new THREE.Vector3(0, -5, -10);
const SHIELD_RADIUS = 13;

const MAX_ACTIVE_SHIPS = 4;

// ================= STATE =================
let shipIdCounter = 0;
const activeShips = [];
let score = 0;

const shipsDestroyedByType = { 1: 0, 2: 0, 3: 0 };

// ================= SHIP TYPES =================
const SHIP_TYPES = {
  1: { maxHealth: 30, points: 10, color: 0xff5555, weight: 0.5 },
  2: { maxHealth: 60, points: 25, color: 0xffaa00, weight: 0.35 },
  3: { maxHealth: 120, points: 60, color: 0xaa55ff, weight: 0.15 },
};

// ================= SPAWN POINTS =================
const spawnPoints = [];
for (let i = 0; i < 9; i++) {
  const angle = (i / 9) * Math.PI * 2;
  spawnPoints.push({
    position: new THREE.Vector3(
      SHIELD_CENTER.x + Math.cos(angle) * (SHIELD_RADIUS + 8),
      SHIELD_CENTER.y + THREE.MathUtils.randFloat(3, 8),
      SHIELD_CENTER.z + Math.sin(angle) * (SHIELD_RADIUS + 8),
    ),
    isOccupied: false,
  });
}


function pickShipType() {
  const r = Math.random();
  let acc = 0;
  for (const key in SHIP_TYPES) {
    acc += SHIP_TYPES[key].weight;
    if (r <= acc) return SHIP_TYPES[key];
  }
  return SHIP_TYPES[1];
}


export function spawnShip(scene) {
  if (activeShips.length >= MAX_ACTIVE_SHIPS) return;

  const free = spawnPoints.filter(s => !s.isOccupied);
  if (!free.length) return;

  const spawn = free[Math.floor(Math.random() * free.length)];
  const type = pickShipType();

  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1, 3),
    new THREE.MeshStandardMaterial({ color: type.color }),
  );

  mesh.position.copy(spawn.position);
  mesh.lookAt(SHIELD_CENTER);
  scene.add(mesh);

  const healthBar = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
  );
  healthBar.position.set(0, 1.5, 0);
  mesh.add(healthBar);

  const ship = {
    id: shipIdCounter++,
    mesh,
    healthBar,
    health: type.maxHealth,
    maxHealth: type.maxHealth,
    points: type.points,
    spawn,
    moveDir: new THREE.Vector3(
      THREE.MathUtils.randFloat(-0.01, 0.01),
      THREE.MathUtils.randFloat(-0.005, 0.005),
      THREE.MathUtils.randFloat(-0.01, 0.01),
    ),
  };

  spawn.isOccupied = true;
  activeShips.push(ship);
}


export function updateShips(camera) {
  activeShips.forEach(ship => {
    ship.mesh.position.add(ship.moveDir);
    ship.healthBar.scale.x = ship.health / ship.maxHealth;
    ship.healthBar.lookAt(camera.position);
  });
}


export function damageShip(mesh, scene) {
  const ship = activeShips.find(s => s.mesh === mesh);
  if (!ship) return;

  ship.health -= 15;

  if (ship.health <= 0) {
    destroyShip(ship, scene);
  }
}

export function getShipMeshes() {
  return activeShips.map(ship => ship.mesh);
}


function destroyShip(ship, scene) {
  scene.remove(ship.mesh);
  ship.spawn.isOccupied = false;

  score += ship.points;
  shipsDestroyedByType[ship.type]++;

  const idx = activeShips.indexOf(ship);
  if (idx !== -1) activeShips.splice(idx, 1);

  setTimeout(() => spawnShip(scene), 1200);
}

