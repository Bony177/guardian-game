import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { createChimneySmoke } from "./object/smoke";
import { createSpriteExplosion } from "./spriteexplosion";

import {
  spawnShip,
  updateShips,
  damageShip,
  getShipMeshes,
  getActiveShipCount,
  startShipsSession,
  stopShipsSession,
  resetShips,
} from "./ships";
import { createShield } from "./shield";

function disposeMaterial(material) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];

  for (const mat of materials) {
    if (!mat) continue;
    if (mat.map) mat.map.dispose();
    if (mat.lightMap) mat.lightMap.dispose();
    if (mat.emissiveMap) mat.emissiveMap.dispose();
    if (mat.bumpMap) mat.bumpMap.dispose();
    if (mat.normalMap) mat.normalMap.dispose();
    if (mat.roughnessMap) mat.roughnessMap.dispose();
    if (mat.metalnessMap) mat.metalnessMap.dispose();
    if (mat.alphaMap) mat.alphaMap.dispose();
    if (mat.aoMap) mat.aoMap.dispose();
    mat.dispose();
  }
}

function disposeObject3D(root) {
  if (!root) return;
  root.traverse((child) => {
    if (!child.isMesh) return;
    if (child.geometry) child.geometry.dispose();
    disposeMaterial(child.material);
  });
}

const RENDER_LAYER = {
  BUILDINGS: 0,
  MIST: 1,
  SHIELD: 2,
  GUN: 3,
  FX: 4,
};

const VAULT_SHADOW_CONFIG = {
  enabled: true,
  opacity: 3,
  widthScale: 1.18,
  depthScale: 1.08,
  useAbsoluteY: false,
  y: 6,
  yOffset: 0,
  textureStrength: 1,
  castShadow: true,
  receiveShadow: true,
  showBaseFade: false,
};

// Prevent accidental mutation from elsewhere and expose for debug
try {
  // keep an immutable snapshot for change detection
  const __VAULT_SHADOW_CONFIG_SNAPSHOT = JSON.parse(
    JSON.stringify(VAULT_SHADOW_CONFIG),
  );
  // expose for debugging in console
  window.__VAULT_SHADOW_CONFIG = VAULT_SHADOW_CONFIG;
  // shallow freeze to prevent accidental writes
  Object.freeze(VAULT_SHADOW_CONFIG);
  // watcher to detect silent mutations to the exposed object (defensive)
  setInterval(() => {
    try {
      const current = JSON.parse(JSON.stringify(window.__VAULT_SHADOW_CONFIG));
      if (
        JSON.stringify(current) !==
        JSON.stringify(__VAULT_SHADOW_CONFIG_SNAPSHOT)
      ) {
        console.warn("VAULT_SHADOW_CONFIG was mutated at runtime:", current);
      }
    } catch (e) {
      // ignore
    }
  }, 2000);
} catch (e) {
  console.warn("Failed to freeze/expose VAULT_SHADOW_CONFIG", e);
}

function Scene() {
  const mountRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return undefined;
    const mountNode = mountRef.current;

    console.log("Scene mounted");

    let disposed = false;
    let rafId = null;
    let lastRadarCount = -1;
    let lastShieldPercent = -1;
    const timeoutIds = [];
    const activeExplosions = [];

    let scene = null;
    let camera = null;
    let renderer = null;
    let skyDome = null;
    let terrain = null;
    let gunBarrel = null;
    let building = null;
    let barrelBaseZ = 0;
    let muzzleFlashLeft = null;
    let muzzleFlashRight = null;
    let muzzleVideo = null;
    let videoTexture = null;

    let mouseX = 0;
    let mouseY = 0;
    const baseYaw = -Math.PI / 2;
    const basePitch = -0.6;
    let recoilOffset = 0;
    let isRecoiling = false;

    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const shipSessionId = startShipsSession();
    const shieldHealthFill = document.getElementById("shieldHealthFill");
    const shieldHealthValue = document.getElementById("shieldHealthValue");

    const onDoubleClick = (e) => {
      if (!scene || !camera || disposed) return;

      recoilOffset = 0.2;
      isRecoiling = true;

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const shipMeshes = getShipMeshes();
      const intersects = raycaster.intersectObjects(shipMeshes, true);
      if (intersects.length > 0) {
        const hitObject = intersects[0].object;

        damageShip(hitObject);

        const worldPos = new THREE.Vector3();
        hitObject.getWorldPosition(worldPos);

        const explosion = createSpriteExplosion(scene, worldPos);
        activeExplosions.push(explosion);
      }

      if (muzzleVideo && muzzleFlashLeft && muzzleFlashRight) {
        muzzleVideo.currentTime = 0;
        const playPromise = muzzleVideo.play();
        if (playPromise !== undefined) {
          playPromise.catch((error) =>
            console.error("Video play failed:", error),
          );
        }

        muzzleFlashLeft.visible = true;
        muzzleFlashRight.visible = true;

        const timeoutId = window.setTimeout(() => {
          if (muzzleFlashLeft) muzzleFlashLeft.visible = false;
          if (muzzleFlashRight) muzzleFlashRight.visible = false;
        }, 120);
        timeoutIds.push(timeoutId);
      }
    };

    const onMouseMove = (e) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    };

    const onResize = () => {
      if (!camera || !renderer || disposed) return;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("dblclick", onDoubleClick);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0f1f, 0.03);

    camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 10, 20);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x1a1a1a);
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    mountNode.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    ambientLight.layers.enableAll();
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.layers.enableAll();
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const terrainGroundY = -5;
    const shield = createShield();
    // For an upper hemisphere, the rim lies on center Y, so centerY = groundY.
    const shieldCenterY = terrainGroundY;
    shield.object.position.set(0, shieldCenterY, -8);
    shield.object.renderOrder = RENDER_LAYER.SHIELD;
    shield.object.layers.set(RENDER_LAYER.SHIELD);
    shield.object.traverse((child) => {
      child.renderOrder = RENDER_LAYER.SHIELD;
      child.layers.set(RENDER_LAYER.SHIELD);
    });
    if (shield.material) {
      shield.material.depthTest = true;
      shield.material.depthWrite = false;
    }
    scene.add(shield.object);

    const chimneySmoke = createChimneySmoke(scene, new THREE.Vector3(12, 0, 0));

    function createRadialFadeTexture(size = 1012, strength = 0.7) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");

      if (!context) return null;
      const clampedStrength = THREE.MathUtils.clamp(strength, 0, 1);

      const center = size / 2;
      const gradient = context.createRadialGradient(
        center,
        center,
        size * 0.12,
        center,
        center,
        size * 0.5,
      );
      gradient.addColorStop(0, `rgba(255, 255, 255, ${clampedStrength})`);
      gradient.addColorStop(
        0.55,
        `rgba(255, 255, 255, ${clampedStrength * 0.45})`,
      );
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

      context.clearRect(0, 0, size, size);
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      return texture;
    }

    function createGroundShadow(
      size,
      opacity,
      position,
      textureStrength = 0.7,
    ) {
      const shadowTexture = createRadialFadeTexture(1012, textureStrength);
      if (!shadowTexture) return null;

      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity,
        color: new THREE.Color(0x000000),
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
        blending: THREE.NormalBlending,
      });

      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(size.x, size.y),
        shadowMaterial,
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.copy(position);
      shadow.renderOrder = RENDER_LAYER.BUILDINGS;
      shadow.layers.set(RENDER_LAYER.BUILDINGS);
      return shadow;
    }

    // ======================
    // 🌌 Circular Mist Zone
    // ======================

    const textureLoader = new THREE.TextureLoader();
    const mistTexture = textureLoader.load("/textures/mist_circle.png");

    const mistMaterial = new THREE.MeshBasicMaterial({
      map: mistTexture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.NormalBlending,
      color: new THREE.Color(0x2a4d66),
    });

    const mistGeometry = new THREE.PlaneGeometry(100, 100);
    const mistPlane = new THREE.Mesh(mistGeometry, mistMaterial);

    mistPlane.rotation.x = -Math.PI / 2;

    // This plane is bound to the vault footprint once the vault model loads.
    mistPlane.position.set(6, -3.8, 2);
    mistPlane.visible = false;
    mistPlane.renderOrder = RENDER_LAYER.BUILDINGS;
    mistPlane.layers.set(RENDER_LAYER.BUILDINGS);

    scene.add(mistPlane);

    const textureLoaderr = new THREE.TextureLoader();
    const mistTexturer = textureLoaderr.load("/textures/mist_circle.png");

    const mistMaterialr = new THREE.MeshBasicMaterial({
      map: mistTexturer,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.NormalBlending,
      color: new THREE.Color(0x2a4d66),
    });

    const mistGeometryr = new THREE.PlaneGeometry(120, 120);
    const mistPlaner = new THREE.Mesh(mistGeometryr, mistMaterialr);

    mistPlaner.rotation.x = -Math.PI / 2;

    // This plane will be anchored to vault top once the model loads.
    mistPlaner.position.set(2, -1.8, 0);
    mistPlaner.visible = false;
    mistPlaner.renderOrder = RENDER_LAYER.MIST;
    mistPlaner.layers.set(RENDER_LAYER.MIST);

    scene.add(mistPlaner);

    const cityShadow = createGroundShadow(
      new THREE.Vector2(34, 26),
      0.35,
      new THREE.Vector3(0, -4.9, -7),
      0.7,
    );
    if (cityShadow) {
      scene.add(cityShadow);
    }

    const gunGroup = new THREE.Group();
    scene.add(gunGroup);

    const loader = new GLTFLoader();

    loader.load(
      "/models/terrain.glb",
      (gltf) => {
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }
        terrain = gltf.scene;
        terrain.scale.set(40, 40, 40);
        terrain.position.set(0, -5, -5);
        terrain.renderOrder = RENDER_LAYER.BUILDINGS;
        terrain.layers.set(RENDER_LAYER.BUILDINGS);
        terrain.traverse((child) => {
          child.renderOrder = RENDER_LAYER.BUILDINGS;
          child.layers.set(RENDER_LAYER.BUILDINGS);
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(terrain);
      },
      undefined,
      (error) => console.error("Error loading terrain", error),
    );

    loader.load(
      "/models/space.glb",
      (gltf) => {
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }
        skyDome = gltf.scene;
        skyDome.scale.set(100, 100, 100);
        skyDome.position.set(0, 0, 0);
        skyDome.traverse((child) => {
          if (child.isMesh) {
            child.material.side = THREE.BackSide;
            child.material.depthWrite = false;
            child.castShadow = false;
            child.receiveShadow = false;
          }
        });
        scene.add(skyDome);
      },
      undefined,
      (err) => console.error("Sky dome load error", err),
    );

    loader.load(
      "/models/gun_base.glb",
      (gltf) => {
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }

        const gunBase = gltf.scene;
        gunBase.scale.set(12, 12, 12);
        gunBase.position.set(0, 0, 12);
        gunBase.rotation.x = -0.6;
        // Put gun base on top of shield: set renderOrder=2 and keep depthTest enabled
        gunBase.renderOrder = RENDER_LAYER.GUN;
        gunBase.layers.set(RENDER_LAYER.GUN);
        gunBase.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Keep depthTest enabled and allow depth writing for opaque gun geometry
            if (child.material) {
              child.material.depthTest = true;
              child.material.depthWrite = true;
            }
          }
          // apply renderOrder to all children so they draw in the correct sequence
          child.renderOrder = RENDER_LAYER.GUN;
          child.layers.set(RENDER_LAYER.GUN);
        });
        gunGroup.add(gunBase);
      },
      undefined,
      (err) => console.error("Gun base load error", err),
    );

    loader.load(
      "/models/gun_barrel.glb",
      (gltf) => {
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }

        gunBarrel = gltf.scene;
        gunBarrel.scale.set(8, 8, 8);
        gunBarrel.position.set(0, 0.5, 10);
        barrelBaseZ = gunBarrel.position.z;
        gunBarrel.rotation.x = -0.6;
        gunBarrel.rotation.y = 1;
        // Put gun barrel on top of shield (above gun base)
        gunBarrel.renderOrder = RENDER_LAYER.GUN;
        gunBarrel.layers.set(RENDER_LAYER.GUN);
        gunBarrel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            // Keep depthTest enabled for correct occlusion against other opaque objects
            if (child.material) {
              child.material.depthTest = true;
              child.material.depthWrite = true;
            }
          }
          child.renderOrder = RENDER_LAYER.GUN;
          child.layers.set(RENDER_LAYER.GUN);
        });
        gunGroup.add(gunBarrel);

        const video = document.createElement("video");
        video.src = "/textures/muzzle_flash.mp4";
        video.loop = false;
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.crossOrigin = "anonymous";
        video.load();
        muzzleVideo = video;

        videoTexture = new THREE.VideoTexture(video);
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.generateMipmaps = false;

        const muzzleMaterial = new THREE.SpriteMaterial({
          map: videoTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        muzzleFlashLeft = new THREE.Sprite(muzzleMaterial);
        muzzleFlashLeft.scale.set(2, 2, 1);
        muzzleFlashLeft.position.set(-0.3, 0.2, 0.5);
        muzzleFlashLeft.visible = false;
        // Draw muzzle sprites above everything else (sprites remain additive/translucent)
        muzzleFlashLeft.renderOrder = RENDER_LAYER.FX;
        muzzleFlashLeft.layers.set(RENDER_LAYER.FX);
        if (muzzleFlashLeft.material) {
          muzzleFlashLeft.material.depthTest = true;
          muzzleFlashLeft.material.depthWrite = false;
        }
        gunBarrel.add(muzzleFlashLeft);

        muzzleFlashRight = new THREE.Sprite(muzzleMaterial.clone());
        muzzleFlashRight.scale.set(2, 2, 1);
        muzzleFlashRight.position.set(0.3, 0.2, 0.5);
        muzzleFlashRight.visible = false;
        muzzleFlashRight.renderOrder = RENDER_LAYER.FX;
        muzzleFlashRight.layers.set(RENDER_LAYER.FX);
        if (muzzleFlashRight.material) {
          muzzleFlashRight.material.depthTest = true;
          muzzleFlashRight.material.depthWrite = false;
        }
        gunBarrel.add(muzzleFlashRight);
      },
      undefined,
      (err) => console.error("Gun barrel load error", err),
    );

    const vaultLoader = new GLTFLoader();

    let vault = null;
    let vaultShadow = null;

    vaultLoader.load(
      "/models/vault1.glb", // <-- put your model path here
      (gltf) => {
        vault = gltf.scene;

        // Adjust scale to fit your world
        vault.scale.set(17, 17, 17);
        vault.rotation.y = -Math.PI / 2; // -90° rotate

        // Fixed world position
        vault.position.set(0, 1.5, 0);
        vault.renderOrder = RENDER_LAYER.BUILDINGS;
        vault.layers.set(RENDER_LAYER.BUILDINGS);

        // Log config at vault load to help debug overrides
        console.log(
          "VAULT_SHADOW_CONFIG (at vault load):",
          VAULT_SHADOW_CONFIG,
        );
        vault.traverse((child) => {
          child.renderOrder = RENDER_LAYER.BUILDINGS;
          child.layers.set(RENDER_LAYER.BUILDINGS);
          if (child.isMesh) {
            // Enforce cast/receive shadow according to config
            child.castShadow = !!VAULT_SHADOW_CONFIG.castShadow;
            child.receiveShadow = !!VAULT_SHADOW_CONFIG.receiveShadow;

            // optional: better lighting response and ensure material updates
            if (child.material) {
              try {
                child.material.roughness = 0.6;
                child.material.metalness = 0.2;
                child.material.needsUpdate = true;
              } catch (e) {
                console.warn(
                  "Failed to set material properties on vault child",
                  e,
                );
              }
            }
          }
        });

        scene.add(vault);

        const vaultBounds = new THREE.Box3().setFromObject(vault);
        // store bounds for runtime updates
        vault.userData.vaultBounds = vaultBounds;
        const vaultCenter = new THREE.Vector3();
        vaultBounds.getCenter(vaultCenter);
        const vaultWidth = vaultBounds.max.x - vaultBounds.min.x;
        const vaultDepth = vaultBounds.max.z - vaultBounds.min.z;
        const vaultBaseY = vaultBounds.min.y + 0.04;
        const vaultTopY = vaultBounds.max.y + 0.08;

        if (VAULT_SHADOW_CONFIG.enabled) {
          const shadowSize = new THREE.Vector2(
            vaultWidth * VAULT_SHADOW_CONFIG.widthScale,
            vaultDepth * VAULT_SHADOW_CONFIG.depthScale,
          );
          const shadowPosition = new THREE.Vector3(
            vaultCenter.x,
            VAULT_SHADOW_CONFIG.useAbsoluteY
              ? VAULT_SHADOW_CONFIG.y
              : vaultBounds.min.y + VAULT_SHADOW_CONFIG.yOffset,
            vaultCenter.z,
          );
          vaultShadow = createGroundShadow(
            shadowSize,
            VAULT_SHADOW_CONFIG.opacity,
            shadowPosition,
            VAULT_SHADOW_CONFIG.textureStrength,
          );
          if (vaultShadow) {
            // Ensure shadow material matches config (in case defaults differ)
            try {
              if (vaultShadow.material) {
                vaultShadow.material.opacity = VAULT_SHADOW_CONFIG.opacity;
                // darker base if desired
                vaultShadow.material.color = new THREE.Color(0x000000);
                vaultShadow.material.needsUpdate = true;
              }
            } catch (e) {
              console.warn("Failed to enforce vaultShadow material props", e);
            }
            scene.add(vaultShadow);
            // keep reference for later tweaks
            vault.userData.vaultShadow = vaultShadow;
          }
        }

        mistPlane.position.set(vaultCenter.x, vaultBaseY, vaultCenter.z);
        mistPlane.scale.set(vaultWidth / 35, vaultDepth / 35, 1);
        mistPlane.visible = true;

        // mistPlaner.position.set(vaultCenter.x, vaultTopY, vaultCenter.z);
        mistPlaner.scale.set(vaultWidth / 100, vaultDepth / 100, 1);
        mistPlaner.visible = true;

        const vaultBaseFadeTexture = createRadialFadeTexture();
        if (VAULT_SHADOW_CONFIG.showBaseFade && vaultBaseFadeTexture) {
          const vaultBaseFadeMaterial = new THREE.MeshBasicMaterial({
            map: vaultBaseFadeTexture,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            depthTest: true,
            color: new THREE.Color(0x0f2940),
            blending: THREE.NormalBlending,
          });

          const vaultBaseFade = new THREE.Mesh(
            new THREE.PlaneGeometry(12, 12),
            vaultBaseFadeMaterial,
          );
          vaultBaseFade.rotation.x = -Math.PI / 2;
          // Slightly below vault pivot so the base seam fades into terrain fog.
          vaultBaseFade.position.set(0, vault.position.y - 0.35, 0);
          vaultBaseFade.renderOrder = RENDER_LAYER.BUILDINGS;
          vaultBaseFade.layers.set(RENDER_LAYER.BUILDINGS);
          scene.add(vaultBaseFade);
        }

        console.log("✅ Vault model loaded");
      },
      undefined,
      (err) => console.error("❌ Vault load error", err),
    );

    //bulding load

    const gltfLoader = new GLTFLoader();
    function loadBuilding(path, position, scale, rotationY = Math.PI) {
      gltfLoader.load(
        path,
        (gltf) => {
          if (disposed) {
            disposeObject3D(gltf.scene);
            return;
          }

          const model = gltf.scene;
          building = model;

          model.scale.set(scale, scale, scale);
          model.position.copy(position);
          model.rotation.y = rotationY;
          model.renderOrder = RENDER_LAYER.BUILDINGS;
          model.layers.set(RENDER_LAYER.BUILDINGS);

          model.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
            child.renderOrder = RENDER_LAYER.BUILDINGS;
            child.layers.set(RENDER_LAYER.BUILDINGS);
          });

          //scene.add(model);
          console.log(`Loaded building: ${path}`);
        },
        undefined,
        (err) => console.error(`Error loading building: ${path}`, err),
      );
    }
    //loadBuilding("/models/bl5.glb", new THREE.Vector3(4, 3, 4), 4);
    //loadBuilding("/models/bl6.glb", new THREE.Vector3(-4, 3, 4), 5);

    spawnShip(scene, camera, shipSessionId);
    spawnShip(scene, camera, shipSessionId);

    function generateRadarDots(count) {
      const container = document.getElementById("dots");
      if (!container) return;
      container.innerHTML = "";
      for (let i = 0; i < count; i += 1) {
        const dot = document.createElement("div");
        dot.classList.add("dot");
        dot.style.left = `${5 + Math.random() * 90}%`;
        dot.style.top = `${10 + Math.random() * 75}%`;
        container.appendChild(dot);
      }
    }

    function updateRadarUI() {
      const count = getActiveShipCount();
      if (count !== lastRadarCount) {
        lastRadarCount = count;
        const enemyNumber = document.getElementById("enemyNumber");
        if (enemyNumber) {
          enemyNumber.textContent = count.toString().padStart(2, "0");
        }
        generateRadarDots(count);
      }
    }

    function updateShieldUI() {
      const ratio = THREE.MathUtils.clamp(
        shield.health / shield.maxHealth,
        0,
        1,
      );
      const percent = Math.round(ratio * 100);

      if (percent === lastShieldPercent) return;
      lastShieldPercent = percent;

      if (shieldHealthFill) {
        shieldHealthFill.style.width = `${percent}%`;
      }
      if (shieldHealthValue) {
        shieldHealthValue.textContent = `${percent}%`;
      }
    }

    function animate() {
      if (disposed) return;
      rafId = window.requestAnimationFrame(animate);

      const deltaMs = clock.getDelta() * 1000;
      const deltaSeconds = deltaMs / 1000;

      updateShips(camera, scene, deltaMs, shield, shipSessionId);
      // 🎥 Camera shake when shield destroyed
      if (shield.isDestroyed && shield.destroyTimer < 1.3) {
        const shakeAmount = 0.15 * (1 - shield.destroyTimer / 1.3);
        camera.position.x += (Math.random() - 0.5) * shakeAmount;
        camera.position.y += (Math.random() - 0.5) * shakeAmount;
      }

      shield.update(deltaSeconds);
      chimneySmoke.update();

      updateRadarUI();
      updateShieldUI();

      if (gunBarrel) {
        if (isRecoiling) {
          gunBarrel.position.z +=
            (barrelBaseZ + recoilOffset - gunBarrel.position.z) * 0.3;
          if (
            Math.abs(gunBarrel.position.z - (barrelBaseZ + recoilOffset)) < 0.01
          ) {
            recoilOffset = 0;
          }
        } else {
          gunBarrel.position.z += (barrelBaseZ - gunBarrel.position.z) * 0.2;
        }

        if (Math.abs(gunBarrel.position.z - barrelBaseZ) < 0.01) {
          gunBarrel.position.z = barrelBaseZ;
          isRecoiling = false;
        }

        const yawOffset = -mouseX * 0.8;
        const pitchOffset = -mouseY * 0.4;
        gunBarrel.rotation.y +=
          (baseYaw + yawOffset - gunBarrel.rotation.y) * 0.1;
        gunBarrel.rotation.x +=
          (basePitch + pitchOffset - gunBarrel.rotation.x) * 0.1;
        gunBarrel.rotation.x = THREE.MathUtils.clamp(
          gunBarrel.rotation.x,
          basePitch - 0.3,
          basePitch + 0.2,
        );
      }

      if (videoTexture) videoTexture.needsUpdate = true;
      for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const stillAlive = activeExplosions[i].update(deltaSeconds);
        if (!stillAlive) {
          activeExplosions.splice(i, 1);
        }
      }

      // Enforce vault shadow config at runtime to prevent silent overrides
      if (vault && vault.userData && vault.userData.vaultShadow) {
        const vs = vault.userData.vaultShadow;
        const bounds = vault.userData.vaultBounds;
        try {
          if (vs.material) {
            if (vs.material.opacity !== VAULT_SHADOW_CONFIG.opacity) {
              vs.material.opacity = VAULT_SHADOW_CONFIG.opacity;
              vs.material.needsUpdate = true;
            }
            vs.material.color.set(0x000000);
          }
          if (bounds) {
            const minY = bounds.min.y;
            vs.position.y = VAULT_SHADOW_CONFIG.useAbsoluteY
              ? VAULT_SHADOW_CONFIG.y
              : minY + VAULT_SHADOW_CONFIG.yOffset;
          }
        } catch (e) {
          console.warn("vault shadow enforcement failed", e);
        }
      }

      renderer.clear();
      camera.layers.set(RENDER_LAYER.BUILDINGS);
      renderer.render(scene, camera);

      renderer.clearDepth();
      camera.layers.set(RENDER_LAYER.MIST);
      renderer.render(scene, camera);

      renderer.clearDepth();
      camera.layers.set(RENDER_LAYER.SHIELD);
      renderer.render(scene, camera);

      renderer.clearDepth();
      camera.layers.set(RENDER_LAYER.GUN);
      renderer.render(scene, camera);

      renderer.clearDepth();
      camera.layers.set(RENDER_LAYER.FX);
      renderer.render(scene, camera);
    }

    console.log("Starting animation loop");
    animate();

    return () => {
      disposed = true;
      stopShipsSession(shipSessionId);

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }

      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }

      window.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);

      if (muzzleVideo) {
        muzzleVideo.pause();
        muzzleVideo.removeAttribute("src");
        muzzleVideo.load();
      }
      if (videoTexture) videoTexture.dispose();

      resetShips();

      if (terrain) {
        scene.remove(terrain);
        disposeObject3D(terrain);
      }
      if (skyDome) {
        scene.remove(skyDome);
        disposeObject3D(skyDome);
      }
      if (building) {
        scene.remove(building);
        disposeObject3D(building);
      }

      disposeObject3D(scene);
      if (renderer) {
        renderer.renderLists.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      }

      if (mountNode && renderer?.domElement) {
        if (mountNode.contains(renderer.domElement)) {
          mountNode.removeChild(renderer.domElement);
        }
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    />
  );
}

export default Scene;
