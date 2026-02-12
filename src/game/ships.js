// ships.js
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { initAttackState, updateShipAttack } from "./attack";


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

// ================= CAMERA-ALIGNED SPAWN VOLUME =================
// We sample points directly from bounded slices of the camera frustum.
const SPAWN_HORIZONTAL_VIEW_FILL = 0.75;
const SPAWN_VERTICAL_VIEW_FILL = 0.6;
const SPAWN_ATTEMPTS = 40;
const MIN_SPAWN_SEPARATION = 4;


// ================= STATE =================
let shipIdCounter = 0;
const activeShips = [];
let score = 0;

const shipsDestroyedByType = { 1: 0, 2: 0, 3: 0 };



let spawnTimer = 0;
const SPAWN_INTERVAL = 1200; // milliseconds

function getCameraBasis(camera) {
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);

  const right = new THREE.Vector3()
    .crossVectors(forward, camera.up)
    .normalize();
  const up = new THREE.Vector3()
    .crossVectors(right, forward)
    .normalize();

  return { forward, right, up };
}

function getSpawnDistanceRange(camera) {
  const shieldDistance = camera.position.distanceTo(SHIELD_CENTER);

  // Keep spawns between camera and shield with margins on both sides.
  const maxDistanceFromCamera = Math.min(
    camera.far * 0.6,
    shieldDistance - SHIELD_RADIUS * 0.35,
  );
  const minDistanceFromCamera = Math.max(
    camera.near + 4,
    maxDistanceFromCamera * 0.45,
  );

  if (minDistanceFromCamera >= maxDistanceFromCamera) return null;
  return { minDistanceFromCamera, maxDistanceFromCamera };
}

function samplePointInFrustumSlice(camera, basis, distanceFromCamera) {
  const center = camera.position
    .clone()
    .addScaledVector(basis.forward, distanceFromCamera);

  const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distanceFromCamera;
  const halfWidth = halfHeight * camera.aspect;

  const u = THREE.MathUtils.randFloat(-SPAWN_HORIZONTAL_VIEW_FILL, SPAWN_HORIZONTAL_VIEW_FILL);
  const v = THREE.MathUtils.randFloat(-SPAWN_VERTICAL_VIEW_FILL, SPAWN_VERTICAL_VIEW_FILL);

  return center
    .clone()
    .addScaledVector(basis.right, u * halfWidth)
    .addScaledVector(basis.up, v * halfHeight);
}

function isPointInShieldFrontHalfSpace(point, camera) {
  const shieldToCameraDir = new THREE.Vector3()
    .subVectors(camera.position, SHIELD_CENTER)
    .normalize();

  const pointFromShield = new THREE.Vector3().subVectors(point, SHIELD_CENTER);
  return pointFromShield.dot(shieldToCameraDir) > 0;
}

function isSeparatedFromActiveShips(point) {
  for (const ship of activeShips) {
    if (!ship.mesh || ship.state !== "alive") continue;
    if (ship.mesh.position.distanceTo(point) < MIN_SPAWN_SEPARATION) return false;
  }
  return true;
}

function pickSpawnPosition(camera) {
  if (!camera) return null;

  camera.updateMatrixWorld(true);
  const basis = getCameraBasis(camera);
  const distanceRange = getSpawnDistanceRange(camera);
  if (!distanceRange) return null;

  for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
    const distanceFromCamera = THREE.MathUtils.randFloat(
      distanceRange.minDistanceFromCamera,
      distanceRange.maxDistanceFromCamera,
    );

    const point = samplePointInFrustumSlice(camera, basis, distanceFromCamera);

    if (!isPointInShieldFrontHalfSpace(point, camera)) continue;
    if (point.distanceTo(SHIELD_CENTER) <= SHIELD_RADIUS + 1.5) continue;
    if (point.distanceTo(GUN_POSITION) <= MIN_GUN_DISTANCE) continue;
    if (!isSeparatedFromActiveShips(point)) continue;

    return { position: point };
  }

  return null;
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

export function spawnShip(scene,camera) {
  const typeId = pickShipType();
  const type = SHIP_TYPES[typeId];

  // fast checks: total caps and concurrent load caps
  if (activeShips.length + inFlightLoads >= MAX_ACTIVE_SHIPS) return;
  if (inFlightLoads >= MAX_CONCURRENT_LOADS) return;

  const spawn = pickSpawnPosition(camera);
  if (!spawn) return;

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

    placeholder.mesh = mesh;
    placeholder.healthBar = healthBar;
    placeholder.state = "alive";

    initAttackState(placeholder);


    // fill in placeholder
    placeholder.mesh = mesh;
    placeholder.healthBar = healthBar;
    placeholder.state = "alive";
    
  }).catch((err) => {
    console.error("Failed to load ship model", err);
    // cleanup reservation and placeholder
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

    
    if (ship.state === "alive" && ship.mesh) {

  const deltaSeconds = delta / 1000;

  // Initialize movement state if not present
  if (ship.isMoving === undefined) {
    ship.isMoving = true;
    ship.moveTimer = THREE.MathUtils.randFloat(1, 3);
    ship.pauseTimer = 0;
  }

  if (ship.isMoving) {
    ship.mesh.position.add(ship.moveDir);
    ship.moveTimer -= deltaSeconds;

    if (ship.moveTimer <= 0) {
      ship.isMoving = false;
      ship.pauseTimer = THREE.MathUtils.randFloat(1, 2);
    }

  } else {
    ship.pauseTimer -= deltaSeconds;

    if (ship.pauseTimer <= 0) {
      ship.isMoving = true;
      ship.moveTimer = THREE.MathUtils.randFloat(1, 3);
    }
  }

  updateShipAttack(ship, delta, shield);

  ship.mesh.position.y += Math.sin(Date.now() * 0.002) * 0.002;
  ship.healthBar.lookAt(camera.position);
}

    else if (ship.state === "dying") {
      if (!ship.mesh) {
        destroyShip(ship, scene);
        continue;
      }
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




export function damageShip(hitObject, scene) {

  let mesh = hitObject;

  // Find root ship mesh
  while (mesh && !activeShips.find(s => s.mesh === mesh)) {
    mesh = mesh.parent;
  }

  const ship = activeShips.find(s => s.mesh === mesh);
  if (!ship || ship.state !== "alive" || !ship.mesh) return;

  // Centralized attack cleanup in attack.js


  ship.health -= 15;

  ship.healthBar.scale.x = ship.health / ship.maxHealth;

  if (ship.health <= 0) {
    ship.state = "dying";
    ship.fallSpeed = 0.02;
    ship.healthBar.visible = false;
  }
}


export function getShipMeshes() {
  return activeShips.filter(ship => ship.mesh !== null).map(ship => ship.mesh);
}


function destroyShip(ship, scene) {


  // dispose geometry/materials/textures to avoid memory/GPU leaks
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

  score += ship.points;
  shipsDestroyedByType[ship.type]++;

  const idx = activeShips.indexOf(ship);
  if (idx !== -1) activeShips.splice(idx, 1);

  // small delay before attempting to spawn replacement
  //setTimeout(() => spawnShip(scene,camera), 1200);
}

