// ships.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

const gltfLoader = new GLTFLoader();





// ================= CONFIG =================
const SHIELD_CENTER = new THREE.Vector3(0, -5, -10);
const SHIELD_RADIUS = 13;

const MAX_ACTIVE_SHIPS = 4;


//--------------------ships model----------------
const SHIP_TYPES = {
  1: {
    maxHealth: 30,
    points: 10,
    weight: 0.5,
    model: "/models/fs1.glb",
    scale: 2,
  },
  2: {
    maxHealth: 60,
    points: 25,
    weight: 0.35,
    model: "/models/fs2.glb",
    scale: 3,
  },
  3: {
    maxHealth: 120,
    points: 60,
    weight: 0.15,
    model: "/models/fs3.glb",
    scale: 4,
  },
};



// ================= position gun =================
const GUN_POSITION = new THREE.Vector3(0, 0, 12); // same as gun base
const MIN_GUN_DISTANCE = 12; // tweak this


// ================= STATE =================
let shipIdCounter = 0;
const activeShips = [];
let score = 0;

const shipsDestroyedByType = { 1: 0, 2: 0, 3: 0 };



let spawnTimer = 0;
const SPAWN_INTERVAL = 1200; // milliseconds

// ================= SHIP TYPES =================

// ================= SPAWN POINTS =================
const FORWARD_DIR = new THREE.Vector3()
  .subVectors(GUN_POSITION, SHIELD_CENTER)
  .normalize();

// how wide the allowed front arc is
const FRONT_DOT_THRESHOLD = 0.05; // tweak: 0.15 = wider, 0.4 = narrow



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
    if (r <= acc) return Number(key);
  }
  return 1;
}


export function spawnShip(scene) {
  const typeId = pickShipType();
  const type = SHIP_TYPES[typeId];

  
  if (activeShips.length >= MAX_ACTIVE_SHIPS) return;

  const free = spawnPoints.filter(s => {
  // 1️⃣ occupied check
  if (s.isOccupied) return false;

  // 2️⃣ distance from gun (no face-spawns)
  if (s.position.distanceTo(GUN_POSITION) <= MIN_GUN_DISTANCE) {
    return false;
  }

  // 3️⃣ front-of-sphere check (no back spawns)
  const spawnDirFromShield = new THREE.Vector3(
  s.position.x - SHIELD_CENTER.x,
  0, // 👈 IGNORE HEIGHT
  s.position.z - SHIELD_CENTER.z
).normalize();

const forwardDirXZ = new THREE.Vector3(
  FORWARD_DIR.x,
  0,
  FORWARD_DIR.z
).normalize();

const dot = spawnDirFromShield.dot(forwardDirXZ);


  // 4️⃣ cone limit (front + slight sides only)
  if (dot <= FRONT_DOT_THRESHOLD) {
    return false;
  }

  // ✅ passed all rules
  return true;
});

  if (!free.length) return;

  const spawn = free[Math.floor(Math.random() * free.length)];

  gltfLoader.load(type.model, (gltf) => {
  const mesh = gltf.scene;

  mesh.scale.setScalar(type.scale);
  mesh.position.copy(spawn.position);

  // IMPORTANT: face shield / vault
  mesh.lookAt(SHIELD_CENTER);

  // shadows
  mesh.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

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
      type: typeId,
      state: "alive",
      fallSpeed: 0,
      rotateSpeed: THREE.MathUtils.randFloat(-0.05, 0.05),
      moveDir: new THREE.Vector3(
        THREE.MathUtils.randFloat(-0.01, 0.01),
        0,
        THREE.MathUtils.randFloat(-0.01, 0.01),
      ),
    };

  spawn.isOccupied = true;
  activeShips.push(ship);
  });
}


export function updateShips(camera, scene, delta) {
  spawnTimer += delta;

  if (spawnTimer > SPAWN_INTERVAL && activeShips.length < MAX_ACTIVE_SHIPS) {
    spawnShip(scene);
    spawnTimer = 0;
  }

  for (let i = activeShips.length - 1; i >= 0; i--) {
    const ship = activeShips[i];

    if (ship.state === "alive") {
      ship.mesh.position.add(ship.moveDir);
      ship.mesh.position.y += Math.sin(Date.now() * 0.002) * 0.002;
      ship.healthBar.lookAt(camera.position);
    } 
    else if (ship.state === "dying") {
      ship.mesh.position.y -= ship.fallSpeed;
      ship.fallSpeed += 0.005;
      ship.mesh.rotation.x += ship.rotateSpeed;
      ship.mesh.rotation.z += ship.rotateSpeed;

      if (ship.mesh.position.y < -30) {
        destroyShip(ship, scene);

      }
      
    }
    // keep spawning if slots free
//if (activeShips.length < MAX_ACTIVE_SHIPS) {
  //spawnShip(scene);
//}

  }
}




export function damageShip(hitObject) {
  let mesh = hitObject;

  // climb up to find ship root
  while (mesh && !activeShips.find(s => s.mesh === mesh)) {
    mesh = mesh.parent;
  }

  const ship = activeShips.find(s => s.mesh === mesh);
  if (!ship || ship.state !== "alive") return;

  ship.health -= 15;

  ship.healthBar.scale.x = ship.health / ship.maxHealth;

  if (ship.health <= 0) {
    ship.state = "dying";   // 👈 switch state
    ship.fallSpeed = 0.02; // 👈 start falling
    ship.healthBar.visible = false;
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

