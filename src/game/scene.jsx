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

const vaultGlowMaskCache = new WeakMap();

function createVaultGlowMaskFromMap(baseMap) {
  if (!baseMap || !baseMap.image) return null;
  if (vaultGlowMaskCache.has(baseMap)) return vaultGlowMaskCache.get(baseMap);

  const image = baseMap.image;
  const width = image.width || image.videoWidth;
  const height = image.height || image.videoHeight;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  try {
    context.drawImage(image, 0, 0, width, height);
  } catch (err) {
    console.warn("Unable to draw vault texture for glow mask", err);
    return null;
  }

  const imageData = context.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) * 0.5;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
      if (h < 0) h += 1;
    }

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const isBlue = h >= 0.5 && h <= 0.68 && s >= 0.08;
    const isBlueWhite = s <= 0.2 && l >= 0.72;
    const isGlowingPixel = luminance >= 0.58 && (isBlue || isBlueWhite);

    const maskStrength = isGlowingPixel
      ? THREE.MathUtils.clamp((luminance - 0.56) / 0.34, 0, 1)
      : 0;
    const maskValue = Math.round(maskStrength * 255);

    pixels[i] = maskValue;
    pixels[i + 1] = maskValue;
    pixels[i + 2] = maskValue;
    pixels[i + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);

  const maskTexture = new THREE.CanvasTexture(canvas);
  maskTexture.flipY = baseMap.flipY;
  maskTexture.wrapS = baseMap.wrapS;
  maskTexture.wrapT = baseMap.wrapT;
  maskTexture.repeat.copy(baseMap.repeat);
  maskTexture.offset.copy(baseMap.offset);
  maskTexture.rotation = baseMap.rotation;
  maskTexture.center.copy(baseMap.center);
  maskTexture.needsUpdate = true;

  vaultGlowMaskCache.set(baseMap, maskTexture);
  return maskTexture;
}

function applyVaultGlowToLightBlueMaterials(material) {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];

  for (const mat of materials) {
    if (!mat || !mat.color || !mat.color.isColor) continue;

    let appliedMaskedGlow = false;
    if (mat.map) {
      const glowMask = createVaultGlowMaskFromMap(mat.map);
      if (glowMask) {
        mat.emissiveMap = glowMask;
        mat.emissive = new THREE.Color(0x2f8fff);
        mat.emissiveIntensity = 7.15;
        appliedMaskedGlow = true;
      }
    }

    if (!appliedMaskedGlow) {
      const hsl = { h: 0, s: 0, l: 0 };
      mat.color.getHSL(hsl);
      const isBlueWhite = hsl.s <= 0.22 && hsl.l >= 0.7;
      const isLightBluish =
        hsl.h >= 0.5 &&
        hsl.h <= 0.68 &&
        hsl.s >= 0.08 &&
        hsl.s <= 0.55 &&
        hsl.l >= 0.56;
      if (!(isBlueWhite || isLightBluish)) continue;
      mat.emissive = new THREE.Color(0x1d6fff);
      mat.emissiveIntensity = 0.26;
    }
    mat.needsUpdate = true;
  }
}

const RENDER_LAYER = {
  BUILDINGS: 0,
  MIST: 1,
  SHIELD: 2,
  GUN: 3,
  FX: 4,
  CHIMNEY_SMOKE: 5,
};

const VAULT_SHADOW = {
  enabled: true,
  opacity: 1,
  color: 0x000000,
  textureStrength: 1,
  widthScale: 1.42,
  depthScale: 1.48,
  useAbsolutePosition: false,
  position: { x: 6, y: -7.95, z: 5 },
  offset: { x: 0, y: 0.03, z: 0 },
};

// Expose for runtime tweaking
window.__VAULT_SHADOW = VAULT_SHADOW;
console.log("✅ VAULT_SHADOW exposed to window.__VAULT_SHADOW");
console.log("   Edit via: window.__VAULT_SHADOW.offset.y = -0.5 (for example)");

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
    let backgroundTexture = null;
    let skyBackdrop = null;
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
    const vaultGlowPulseTargets = [];
    const seenVaultGlowMaterials = new Set();
    const vaultGlowPulseSpeed = 2.4;
    const vaultGlowPulseMin = 0.62;
    const vaultGlowPulseMax = 2.18;

    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const shipSessionId = startShipsSession();
    const shieldHealthFill = document.getElementById("shieldHealthFill");
    const shieldHealthValue = document.getElementById("shieldHealthValue");

    function registerVaultGlowPulseTargets(material) {
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];

      for (const mat of materials) {
        if (!mat || seenVaultGlowMaterials.has(mat)) continue;
        if (!mat.emissive || !mat.emissive.isColor) continue;
        if (typeof mat.emissiveIntensity !== "number") continue;
        if (mat.emissiveIntensity <= 0) continue;

        seenVaultGlowMaterials.add(mat);
        vaultGlowPulseTargets.push({
          material: mat,
          baseIntensity: mat.emissiveIntensity,
        });
      }
    }

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

    backgroundTexture = new THREE.TextureLoader().load("/textures/nightsky.jpg");
    backgroundTexture.colorSpace = THREE.SRGBColorSpace;

    const skyGeometry = new THREE.SphereGeometry(700, 64, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({
      map: backgroundTexture,
      side: THREE.BackSide,
      depthWrite: false,
    });
    skyBackdrop = new THREE.Mesh(skyGeometry, skyMaterial);
    skyBackdrop.renderOrder = -1000;
    skyBackdrop.layers.set(RENDER_LAYER.CHIMNEY_SMOKE);
    scene.add(skyBackdrop);

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

    const chimneySmokeConfigs = [
      { position: new THREE.Vector3(3, 0, 0), opacity: 0.05, speed: 1 },
      { position: new THREE.Vector3(-3, 2, 0), opacity: 0.02, speed: 1.2 },
    ];
    const chimneySmokes = chimneySmokeConfigs.map((config) =>
      createChimneySmoke(scene, config),
    );
    const smokeUnderRenderOrder = RENDER_LAYER.BUILDINGS - 1;
    chimneySmokes.forEach((smokeFx) => {
      if (!smokeFx?.object) return;
      smokeFx.object.renderOrder = smokeUnderRenderOrder;
      smokeFx.object.layers.set(RENDER_LAYER.BUILDINGS);
      smokeFx.object.traverse((child) => {
        child.renderOrder = smokeUnderRenderOrder;
        child.layers.set(RENDER_LAYER.BUILDINGS);
        if (child.material) {
          child.material.depthTest = true;
          child.material.depthWrite = false;
        }
      });
    });

    // Add more smoke stacks by appending config objects to chimneySmokeConfigs.

    function createRadialFadeTexture(size = 1012, strength = 0.4) {
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

    function getVaultShadowPosition(bounds, center) {
      if (VAULT_SHADOW.useAbsolutePosition) {
        return new THREE.Vector3(
          VAULT_SHADOW.position.x,
          VAULT_SHADOW.position.y,
          VAULT_SHADOW.position.z,
        );
      }

      return new THREE.Vector3(
        center.x + VAULT_SHADOW.offset.x,
        bounds.min.y + VAULT_SHADOW.offset.y,
        center.z + VAULT_SHADOW.offset.z,
      );
    }

    function applyVaultShadowSettings(shadow, bounds) {
      if (!shadow || !bounds) return;

      const center = new THREE.Vector3();
      bounds.getCenter(center);

      const width = Math.max(bounds.max.x - bounds.min.x, 0.01);
      const depth = Math.max(bounds.max.z - bounds.min.z, 0.01);
      shadow.scale.set(
        width * VAULT_SHADOW.widthScale,
        depth * VAULT_SHADOW.depthScale,
        1,
      );
      shadow.position.copy(getVaultShadowPosition(bounds, center));
      shadow.visible = !!VAULT_SHADOW.enabled;

      if (shadow.material) {
        shadow.material.opacity = VAULT_SHADOW.opacity;
        shadow.material.color.set(VAULT_SHADOW.color);
        shadow.material.needsUpdate = true;
      }
    }

    function createVaultShadow(bounds) {
      const shadowTexture = createRadialFadeTexture(
        1012,
        VAULT_SHADOW.textureStrength,
      );
      if (!shadowTexture) return null;

      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        opacity: VAULT_SHADOW.opacity,
        color: new THREE.Color(VAULT_SHADOW.color),
        depthWrite: false,
        depthTest: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
        blending: THREE.NormalBlending,
      });

      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        shadowMaterial,
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = RENDER_LAYER.BUILDINGS;
      shadow.layers.set(RENDER_LAYER.BUILDINGS);
      applyVaultShadowSettings(shadow, bounds);
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
      opacity: 0.2,
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

    //scene.add(mistPlane);

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

    const mistGeometryr = new THREE.PlaneGeometry(250, 180);
    const mistPlaner = new THREE.Mesh(mistGeometryr, mistMaterialr);
    mistPlaner.position.set(12, -2.8, -5);

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
    let vaultBounds = null;
    let vaultReflection = null;

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

        vault.traverse((child) => {
          child.renderOrder = RENDER_LAYER.BUILDINGS;
          child.layers.set(RENDER_LAYER.BUILDINGS);
          if (child.isMesh) {
            child.castShadow = false;
            child.receiveShadow = true;

            // optional: better lighting response and ensure material updates
            if (child.material) {
              try {
                applyVaultGlowToLightBlueMaterials(child.material);
                registerVaultGlowPulseTargets(child.material);
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

        vaultBounds = new THREE.Box3().setFromObject(vault);
        const vaultCenter = new THREE.Vector3();
        vaultBounds.getCenter(vaultCenter);
        const vaultWidth = vaultBounds.max.x - vaultBounds.min.x;
        const vaultDepth = vaultBounds.max.z - vaultBounds.min.z;
        const vaultBaseY = vaultBounds.min.y + 0.04;
        vaultShadow = createVaultShadow(vaultBounds);
        if (vaultShadow) scene.add(vaultShadow);

        mistPlane.position.set(vaultCenter.x, vaultBaseY, vaultCenter.z);
        mistPlane.scale.set(vaultWidth / 35, vaultDepth / 35, 1);
        mistPlane.visible = true;

        const vaultReflectionTexture = createRadialFadeTexture(1024, 0.9);
        if (vaultReflectionTexture) {
          const vaultReflectionMaterial = new THREE.MeshBasicMaterial({
            map: vaultReflectionTexture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending,
            color: new THREE.Color(0x2f8fff),
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -4,
          });

          vaultReflection = new THREE.Mesh(
            new THREE.PlaneGeometry(vaultWidth * 1.55, vaultDepth * 1.55),
            vaultReflectionMaterial,
          );
          vaultReflection.rotation.x = -Math.PI / 2;
          vaultReflection.position.set(
            vaultCenter.x,
            vaultBaseY + 0.05,
            vaultCenter.z,
          );
          vaultReflection.renderOrder = RENDER_LAYER.BUILDINGS;
          vaultReflection.layers.set(RENDER_LAYER.BUILDINGS);
          scene.add(vaultReflection);
        }

        mistPlaner.scale.set(vaultWidth / 100, vaultDepth / 100, 1);
        mistPlaner.visible = true;
        console.log("Vault model loaded");
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
      chimneySmokes.forEach((smokeFx) => smokeFx.update());

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

      if (vaultGlowPulseTargets.length > 0) {
        const elapsed = clock.getElapsedTime();
        const wave = (Math.sin(elapsed * vaultGlowPulseSpeed) + 1) * 0.5;
        const pulseScale =
          vaultGlowPulseMin + wave * (vaultGlowPulseMax - vaultGlowPulseMin);

        for (const target of vaultGlowPulseTargets) {
          target.material.emissiveIntensity = target.baseIntensity * pulseScale;
        }
      }

      if (vault && vaultShadow) {
        vaultBounds = new THREE.Box3().setFromObject(vault);
        applyVaultShadowSettings(vaultShadow, vaultBounds);
        // Log shadow position if config changed (help with debugging)
        if (window.__shadowPosLogged !== JSON.stringify(vaultShadow.position)) {
          window.__shadowPosLogged = JSON.stringify(vaultShadow.position);
          console.log(
            `🎯 Vault shadow pos: x=${vaultShadow.position.x.toFixed(2)}, y=${vaultShadow.position.y.toFixed(2)}, z=${vaultShadow.position.z.toFixed(2)}`,
          );
        }
      }

      renderer.clear();
      camera.layers.set(RENDER_LAYER.CHIMNEY_SMOKE);
      renderer.render(scene, camera);

      renderer.clearDepth();
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
      if (building) {
        scene.remove(building);
        disposeObject3D(building);
      }
      if (vaultReflection) {
        scene.remove(vaultReflection);
        disposeObject3D(vaultReflection);
      }
      if (vaultShadow) {
        scene.remove(vaultShadow);
        disposeObject3D(vaultShadow);
      }
      if (skyBackdrop) {
        scene.remove(skyBackdrop);
        disposeObject3D(skyBackdrop);
      }
      if (backgroundTexture) {
        backgroundTexture.dispose();
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
