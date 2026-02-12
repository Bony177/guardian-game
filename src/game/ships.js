// ships.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { updateShipAttack, initAttackState } from "./attack.js";


const gltfLoader = new GLTFLoader();

// model cache and load controls
const modelCache = new Map();
let inFlightLoads = 0;
const MAX_CONCURRENT_LOADS = 3;

function loadGLTF(url) {
  // store promise in cache so multiple requests share the same load
  if (modelCache.has(url)) return modelCache.get(url);

  const p = new Promise((resolve, reject) => {
    gltfLoader.load(url, (gltf) => resolve(gltf), undefined, (err) => reject(err));
  });

  modelCache.set(url, p);
  return p;
}





// ================= CONFIG =================
const SHIELD_CENTER = new THREE.Vector3(0, -5, -10);
const SHIELD_RADIUS = 13;

const MIN_ACTIVE_SHIPS = 3;
const MAX_ACTIVE_SHIPS = 5;


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



// spawn points spread across several elevations and azimuths so ships
// can come from top-right/top-left and slightly toward the rear (but
// not directly behind the shield).
const spawnPoints = [];
const elevations = [
  THREE.MathUtils.degToRad(10), // low
  THREE.MathUtils.degToRad(25), // mid (top-left/top-right)
  THREE.MathUtils.degToRad(40), // high (near top)
];
const azimuths = [
  -Math.PI * 3 / 4,
  -Math.PI / 2,
  -Math.PI / 4,
  0,
  Math.PI / 4,
  Math.PI / 2,
  Math.PI * 3 / 4,
  //-Math.PI / 4,
  //-Math.PI / 8,
  //0,
  //Math.PI / 8,
  //Math.PI / 4,
];

for (const elev of elevations) {
  for (const az of azimuths) {
    const distance = SHIELD_RADIUS + THREE.MathUtils.randFloat(8, 14);
    const x = SHIELD_CENTER.x + Math.cos(elev) * Math.cos(az) * distance;
    const y = SHIELD_CENTER.y + Math.sin(elev) * distance + THREE.MathUtils.randFloat(0, 3);
    const z = SHIELD_CENTER.z + Math.cos(elev) * Math.sin(az) * distance;
    spawnPoints.push({ position: new THREE.Vector3(x, y, z), isOccupied: false });
  }
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

const free = spawnPoints.filter(s => {
    if (s.isOccupied) return false;
    if (s.position.distanceTo(GUN_POSITION) <= MIN_GUN_DISTANCE) return false;

    if (s.position.z > 5) return false;
    if (s.position.z < -40) return false;
    if (Math.abs(s.position.x) > 30) return false;
    if (s.position.y > 25) return false;

    return true;
});




export function spawnShip(scene,camera) {
  const typeId = pickShipType();
  const type = SHIP_TYPES[typeId];

  // fast checks: total caps and concurrent load caps
  if (activeShips.length + inFlightLoads >= MAX_ACTIVE_SHIPS) return;
  if (inFlightLoads >= MAX_CONCURRENT_LOADS) return;

  const free = spawnPoints.filter(s => {
   
    if (s.position.distanceTo(GUN_POSITION) <= MIN_GUN_DISTANCE) return false;

    const spawnDirFromShield = new THREE.Vector3(
      s.position.x - SHIELD_CENTER.x,
      0,
      s.position.z - SHIELD_CENTER.z
    ).normalize();

    const forwardDirXZ = new THREE.Vector3(FORWARD_DIR.x, 0, FORWARD_DIR.z).normalize();
    const horizDot = spawnDirFromShield.dot(forwardDirXZ);

    if (horizDot <= FRONT_DOT_THRESHOLD) {
      const elevationAboveShield = s.position.y - SHIELD_CENTER.y;
      if (!(elevationAboveShield > 6 && horizDot > -0.25)) return false;
    }

    return true;
  });

  if (!free.length) return;

  const spawn = free[Math.floor(Math.random() * free.length)];

  // Reserve the spawn immediately to avoid launching duplicate loads for same slot
  spawn.isOccupied = true;

  // insert a placeholder so activeShips length reflects reserved slots
  const placeholder = {
    id: shipIdCounter++,
    mesh: null,
    healthBar: null,
    health: type.maxHealth,
    maxHealth: type.maxHealth,
    points: type.points,
    spawn,
    type: typeId,
    state: "loading",
    fallSpeed: 0,
    rotateSpeed: THREE.MathUtils.randFloat(-0.05, 0.05),
    moveDir: new THREE.Vector3(
      THREE.MathUtils.randFloat(-0.01, 0.01),
      0,
      THREE.MathUtils.randFloat(-0.01, 0.01),
    ),
  };

  activeShips.push(placeholder);
  inFlightLoads++;

  loadGLTF(type.model).then((gltf) => {
    const mesh = gltf.scene.clone(true);

    mesh.scale.setScalar(type.scale);
    mesh.position.copy(spawn.position);
    console.log("Ship spawned at:", mesh.position);

    // Orient so the ship's local +X axis points toward the shield center.
const dirToShield = new THREE.Vector3()
  .subVectors(SHIELD_CENTER, mesh.position)
  .normalize();


    const xAxis = new THREE.Vector3(1, 0, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(xAxis, dirToShield);
    // preserve world-up (Y) by aligning then re-orienting yaw only
    mesh.quaternion.copy(q);

    // reduce GPU load by defaulting shadows off; enable later if needed
    mesh.traverse(child => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    scene.add(mesh);

    const healthBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
    );
    healthBar.position.set(0, 1.5, 0);
    mesh.add(healthBar);

    // fill in placeholder
    placeholder.mesh = mesh;
    placeholder.healthBar = healthBar;
    placeholder.state = "alive";
    initAttackState(placeholder);
  }).catch((err) => {
    console.error("Failed to load ship model", err);
    // cleanup reservation and placeholder
    spawn.isOccupied = false;
    const idx = activeShips.indexOf(placeholder);
    if (idx !== -1) activeShips.splice(idx, 1);
  }).finally(() => {
    inFlightLoads--;
  });
}


export function updateShips(camera, scene, delta, shield) {
  spawnTimer += delta;

  


  if (spawnTimer > SPAWN_INTERVAL && activeShips.length < MAX_ACTIVE_SHIPS) {
    spawnShip(scene,camera);
    spawnTimer = 0;
  }

  // Ensure we try to maintain the minimum number of active ships,
  // but pace spawns to avoid launching many loads in one frame.
  if (activeShips.length + inFlightLoads < MIN_ACTIVE_SHIPS && activeShips.length < MAX_ACTIVE_SHIPS) {
    spawnShip(scene,camera);
  }

  for (let i = activeShips.length - 1; i >= 0; i--) {
    const ship = activeShips[i];

    if (ship.state === "alive") {
      ship.mesh.position.add(ship.moveDir);
      ship.mesh.position.y += Math.sin(Date.now() * 0.002) * 0.002;
      ship.healthBar.lookAt(camera.position);
      updateShipAttack(ship, delta, scene, shield);
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
  if (!ship || ship.state !== "alive" || !ship.mesh) return;

  ship.health -= 15;

  ship.healthBar.scale.x = ship.health / ship.maxHealth;

  if (ship.health <= 0) {
     
    ship.state = "dying";   // 👈 switch state
    ship.fallSpeed = 0.02; // 👈 start falling
    ship.healthBar.visible = false;
  }
}


export function getShipMeshes() {
  return activeShips.filter(ship => ship.mesh !== null).map(ship => ship.mesh);
}


function destroyShip(ship, scene) {
  // dispose geometry/materials/textures to avoid memory/GPU leaks
  if (ship.beam) {
  scene.remove(ship.beam);
  ship.beam.geometry.dispose();
  ship.beam.material.dispose();
  ship.beam = null;
}

  if (ship.mesh) {
    ship.mesh.traverse(child => {
      if (child.isMesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach(mat => {
            if (mat.map) mat.map.dispose();
            if (mat.lightMap) mat.lightMap.dispose();
            if (mat.emissiveMap) mat.emissiveMap.dispose();
            mat.dispose();
          });
        }
      }
    });
    scene.remove(ship.mesh);
  }

  ship.spawn.isOccupied = false;

  score += ship.points;
  shipsDestroyedByType[ship.type]++;

  const idx = activeShips.indexOf(ship);
  if (idx !== -1) activeShips.splice(idx, 1);

  // small delay before attempting to spawn replacement
  //setTimeout(() => spawnShip(scene,camera), 1200);
}

