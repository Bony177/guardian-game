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
  setShipDestroyedCallback,
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

const SHIELD_RING_DEFAULTS = {
  innerRadiusScale: 1,
  outerRadiusScale: 1.9,
  color: 0x2f8fff,
  opacity: 0.25,
  yOffset: 0.03,
  segments: 128,
};

const BARREL_EXP_DEFAULTS = {
  positions: [
    { x: -0.5, y: 0.16, z: 0.23 },
    { x: -0.5, y: 0.16, z: -0.23 },
  ],
  size: 0.5,
};

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
    const activeExplosions = [];

    let scene = null;
    let camera = null;
    let renderer = null;
    let backgroundTexture = null;
    let skyBackdrop = null;
    let terrain = null;
    let gunBarrel = null;
    let building = null;
    let shieldRing = null;
    let barrelBaseZ = 0;
    let barrelExpSprites = [];
    let barrelExpMaterial = null;
    let barrelExpTexture = null;

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
    const scoreValueElement = document.getElementById("scoreValue");
    const powerFillElement = document.getElementById("powerFill");
    const shieldHealthFill = document.getElementById("shieldHealthFill");
    const shieldHealthValue = document.getElementById("shieldHealthValue");
    const scoreByShipType = {
      1: 100,
      2: 200,
      3: 3000,
    };
    let scoreCurrent = 0;
    let scoreTarget = 0;
    let powerCycleTimer = null;
    const barrelExpState = {
      isPlaying: false,
      elapsed: 0,
      frame: 0,
      frameDuration: 1 / 24,
      totalFrames: 16,
      columns: 4,
      rows: 4,
    };
    const barrelExpControls = {
      positions: BARREL_EXP_DEFAULTS.positions.map((position) => ({
        ...position,
      })),
      size: BARREL_EXP_DEFAULTS.size,
      setPosition(index, x, y, z) {
        const idx = Number(index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= this.positions.length) {
          return;
        }
        const target = this.positions[idx];
        target.x = Number.isFinite(Number(x)) ? Number(x) : target.x;
        target.y = Number.isFinite(Number(y)) ? Number(y) : target.y;
        target.z = Number.isFinite(Number(z)) ? Number(z) : target.z;
        applyBarrelExpTransforms();
      },
      setSize(size) {
        const nextSize = Number(size);
        if (!Number.isFinite(nextSize) || nextSize <= 0) return;
        this.size = nextSize;
        applyBarrelExpTransforms();
      },
    };

    function applyBarrelExpTransforms() {
      if (!barrelExpSprites.length) return;
      for (let i = 0; i < barrelExpSprites.length; i += 1) {
        const sprite = barrelExpSprites[i];
        const position = barrelExpControls.positions[i];
        if (!sprite || !position) continue;
        sprite.position.set(position.x, position.y, position.z);
        sprite.scale.set(barrelExpControls.size, barrelExpControls.size, 1);
      }
    }

    function setBarrelExpFrame(frameIndex) {
      if (!barrelExpTexture) return;
      const clampedFrame = THREE.MathUtils.clamp(
        frameIndex,
        0,
        barrelExpState.totalFrames - 1,
      );
      const column = clampedFrame % barrelExpState.columns;
      const row = Math.floor(clampedFrame / barrelExpState.columns);

      barrelExpTexture.offset.x = column / barrelExpState.columns;
      barrelExpTexture.offset.y = 1 - (row + 1) / barrelExpState.rows;
      barrelExpTexture.needsUpdate = true;
    }

    function playBarrelExp() {
      if (!barrelExpSprites.length) return;
      barrelExpState.isPlaying = true;
      barrelExpState.elapsed = 0;
      barrelExpState.frame = 0;
      setBarrelExpFrame(0);
      for (const sprite of barrelExpSprites) {
        sprite.visible = true;
      }
    }

    function updateBarrelExp(deltaSeconds) {
      if (!barrelExpSprites.length || !barrelExpState.isPlaying) return;

      barrelExpState.elapsed += deltaSeconds;
      const nextFrame = Math.floor(
        barrelExpState.elapsed / barrelExpState.frameDuration,
      );

      if (nextFrame !== barrelExpState.frame) {
        barrelExpState.frame = nextFrame;
        if (barrelExpState.frame >= barrelExpState.totalFrames) {
          barrelExpState.isPlaying = false;
          for (const sprite of barrelExpSprites) {
            sprite.visible = false;
          }
          return;
        }
        setBarrelExpFrame(barrelExpState.frame);
      }
    }

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

      playBarrelExp();
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

    backgroundTexture = new THREE.TextureLoader().load(
      "/textures/nightsky.jpg",
    );
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

    const shieldGlowControls = {
      domeOpacity: shield.glow?.domeOpacity ?? 5,
      domeEmissive: shield.glow?.domeEmissive ?? 1,
      lightning: shield.glow?.lightning ?? 1,
      flash: shield.glow?.flash ?? 1,
      setDomeOpacity(value) {
        const nextValue = Number(value);
        if (!Number.isFinite(nextValue) || !shield.setGlow) return;
        shield.setGlow({ domeOpacity: nextValue });
        this.domeOpacity = shield.glow.domeOpacity;
      },
      setDomeEmissive(value) {
        const nextValue = Number(value);
        if (!Number.isFinite(nextValue) || !shield.setGlow) return;
        shield.setGlow({ domeEmissive: nextValue });
        this.domeEmissive = shield.glow.domeEmissive;
      },
      setLightning(value) {
        const nextValue = Number(value);
        if (!Number.isFinite(nextValue) || !shield.setGlow) return;
        shield.setGlow({ lightning: nextValue });
        this.lightning = shield.glow.lightning;
      },
      setFlash(value) {
        const nextValue = Number(value);
        if (!Number.isFinite(nextValue) || !shield.setGlow) return;
        shield.setGlow({ flash: nextValue });
        this.flash = shield.glow.flash;
      },
      setAll({ domeOpacity, domeEmissive, lightning, flash } = {}) {
        if (!shield.setGlow) return;
        shield.setGlow({ domeOpacity, domeEmissive, lightning, flash });
        this.domeOpacity = shield.glow.domeOpacity;
        this.domeEmissive = shield.glow.domeEmissive;
        this.lightning = shield.glow.lightning;
        this.flash = shield.glow.flash;
      },
    };
    window.__SHIELD_GLOW = shieldGlowControls;
    console.log("✅ SHIELD_GLOW exposed to window.__SHIELD_GLOW");
    console.log(
      "   Edit via: window.__SHIELD_GLOW.setLightning(2), window.__SHIELD_GLOW.setDomeOpacity(0.32)",
    );

    function createShieldRingGeometry(innerRadius, outerRadius) {
      return new THREE.RingGeometry(
        Math.max(innerRadius, 0.01),
        Math.max(outerRadius, innerRadius + 0.01),
        SHIELD_RING_DEFAULTS.segments,
      );
    }

    function createShieldRingFadeTexture(innerRadius, outerRadius, size = 512) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;

      const imageData = context.createImageData(size, size);
      const pixels = imageData.data;
      const center = (size - 1) * 0.5;
      const maxRadius = Math.max(outerRadius, 0.01);
      const innerNorm = THREE.MathUtils.clamp(
        innerRadius / maxRadius,
        0,
        0.999,
      );

      for (let y = 0; y < size; y += 1) {
        const dy = (y - center) / center;
        for (let x = 0; x < size; x += 1) {
          const dx = (x - center) / center;
          const radiusNorm = Math.sqrt(dx * dx + dy * dy);

          const pixelIndex = (y * size + x) * 4;
          const fade =
            radiusNorm <= innerNorm
              ? 1
              : THREE.MathUtils.clamp(
                  1 - (radiusNorm - innerNorm) / Math.max(1 - innerNorm, 0.001),
                  0,
                  1,
                );
          const maskValue = Math.round(fade * 255);

          pixels[pixelIndex] = maskValue;
          pixels[pixelIndex + 1] = maskValue;
          pixels[pixelIndex + 2] = maskValue;
          pixels[pixelIndex + 3] = 255;
        }
      }

      context.putImageData(imageData, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      return texture;
    }

    function updateShieldRingFadeTexture() {
      if (
        !shieldRing ||
        !shieldRing.material ||
        !shieldRing.userData?.controls
      ) {
        return;
      }
      const controls = shieldRing.userData.controls;
      const nextAlphaMap = createShieldRingFadeTexture(
        controls.innerRadius,
        controls.outerRadius,
      );
      if (!nextAlphaMap) return;

      const oldAlphaMap = shieldRing.material.alphaMap;
      shieldRing.material.alphaMap = nextAlphaMap;
      shieldRing.material.needsUpdate = true;
      if (oldAlphaMap) oldAlphaMap.dispose();
    }

    function updateShieldRingPosition() {
      if (!shieldRing || !shield?.object) return;
      shieldRing.position.set(
        shield.object.position.x,
        terrainGroundY + SHIELD_RING_DEFAULTS.yOffset,
        shield.object.position.z,
      );
    }

    function updateShieldRingVisualState() {
      if (
        !shieldRing ||
        !shieldRing.material ||
        !shieldRing.userData?.controls
      ) {
        return;
      }
      const baseOpacity = shieldRing.userData.controls.opacity;
      if (!shield.isDestroyed) {
        shieldRing.visible = true;
        shieldRing.material.opacity = baseOpacity;
        return;
      }

      const fadeDuration = 1.3;
      const life = THREE.MathUtils.clamp(
        1 - shield.destroyTimer / fadeDuration,
        0,
        1,
      );
      const nextOpacity = baseOpacity * life;
      shieldRing.material.opacity = nextOpacity;
      shieldRing.visible = nextOpacity > 0.001;
    }

    function setShieldRingInnerRadius(value) {
      if (!shieldRing || !shieldRing.userData?.controls) return;
      const controls = shieldRing.userData.controls;
      const nextInner = Math.max(Number(value) || 0, 0.01);
      if (nextInner >= controls.outerRadius) return;

      controls.innerRadius = nextInner;
      const oldGeometry = shieldRing.geometry;
      shieldRing.geometry = createShieldRingGeometry(
        controls.innerRadius,
        controls.outerRadius,
      );
      oldGeometry.dispose();
      updateShieldRingFadeTexture();
    }

    function setShieldRingOuterRadius(value) {
      if (!shieldRing || !shieldRing.userData?.controls) return;
      const controls = shieldRing.userData.controls;
      const nextOuter = Math.max(
        Number(value) || 0,
        controls.innerRadius + 0.01,
      );
      if (nextOuter <= controls.innerRadius) return;

      controls.outerRadius = nextOuter;
      const oldGeometry = shieldRing.geometry;
      shieldRing.geometry = createShieldRingGeometry(
        controls.innerRadius,
        controls.outerRadius,
      );
      oldGeometry.dispose();
      updateShieldRingFadeTexture();
    }

    function setShieldRingColor(hex) {
      if (!shieldRing || !shieldRing.material) return;
      const parsed = Number(hex);
      if (!Number.isFinite(parsed)) return;
      shieldRing.userData.controls.color = parsed;
      shieldRing.material.color.set(parsed);
      shieldRing.material.needsUpdate = true;
    }

    function setShieldRingOpacity(value) {
      if (!shieldRing || !shieldRing.material) return;
      const nextOpacity = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
      shieldRing.userData.controls.opacity = nextOpacity;
      updateShieldRingVisualState();
      shieldRing.material.needsUpdate = true;
    }

    const shieldRingInnerRadius =
      shield.radius * SHIELD_RING_DEFAULTS.innerRadiusScale;
    const shieldRingOuterRadius =
      shield.radius * SHIELD_RING_DEFAULTS.outerRadiusScale;
    const shieldRingControls = {
      innerRadius: shieldRingInnerRadius,
      outerRadius: shieldRingOuterRadius,
      color: SHIELD_RING_DEFAULTS.color,
      opacity: SHIELD_RING_DEFAULTS.opacity,
      setInnerRadius: setShieldRingInnerRadius,
      setOuterRadius: setShieldRingOuterRadius,
      setColor: setShieldRingColor,
      setOpacity: setShieldRingOpacity,
    };

    const shieldRingMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(SHIELD_RING_DEFAULTS.color),
      transparent: true,
      opacity: SHIELD_RING_DEFAULTS.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    shieldRing = new THREE.Mesh(
      createShieldRingGeometry(shieldRingInnerRadius, shieldRingOuterRadius),
      shieldRingMaterial,
    );
    shieldRing.rotation.x = -Math.PI / 2;
    shieldRing.renderOrder = RENDER_LAYER.BUILDINGS;
    shieldRing.layers.set(RENDER_LAYER.BUILDINGS);
    shieldRing.userData.controls = shieldRingControls;
    updateShieldRingFadeTexture();
    updateShieldRingPosition();
    scene.add(shieldRing);

    window.__SHIELD_RING = shieldRingControls;
    console.log("✅ SHIELD_RING exposed to window.__SHIELD_RING");
    console.log(
      "   Edit via: window.__SHIELD_RING.setOuterRadius(12), window.__SHIELD_RING.setOpacity(0.5)",
    );

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

        //debug end

        const expTexture = new THREE.TextureLoader().load("/textures/EXP.png");
        expTexture.colorSpace = THREE.SRGBColorSpace;
        expTexture.wrapS = THREE.ClampToEdgeWrapping;
        expTexture.wrapT = THREE.ClampToEdgeWrapping;
        expTexture.repeat.set(
          1 / barrelExpState.columns,
          1 / barrelExpState.rows,
        );
        expTexture.magFilter = THREE.LinearFilter;
        expTexture.minFilter = THREE.LinearFilter;
        barrelExpTexture = expTexture;

        const expMaterial = new THREE.SpriteMaterial({
          map: expTexture,
          transparent: true,
          depthWrite: false,
          depthTest: true,
          blending: THREE.AdditiveBlending,
        });
        barrelExpMaterial = expMaterial;
        barrelExpSprites = barrelExpControls.positions.map(() => {
          const sprite = new THREE.Sprite(expMaterial);
          sprite.visible = false;
          sprite.renderOrder = RENDER_LAYER.GUN - 1;
          sprite.layers.set(RENDER_LAYER.GUN);
          return sprite;
        });
        applyBarrelExpTransforms();
        setBarrelExpFrame(0);
        for (const sprite of barrelExpSprites) {
          gunBarrel.add(sprite);
        }
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

    function formatScore(value) {
      return Math.max(0, Math.round(value)).toLocaleString();
    }

    function showScorePopup(points) {
      const scoreBox = scoreValueElement?.closest(".score-box");
      if (!scoreBox) return;

      const popup = document.createElement("div");
      popup.className = "score-popup";
      popup.textContent = `+${points.toLocaleString()}`;
      popup.style.left = `${58 + Math.random() * 22}%`;
      popup.style.top = `${44 + Math.random() * 12}%`;
      scoreBox.appendChild(popup);

      window.requestAnimationFrame(() => {
        popup.classList.add("is-visible");
      });

      window.setTimeout(() => {
        popup.remove();
      }, 800);
    }

    function addScore(shipType) {
      const points = scoreByShipType[shipType] ?? 0;
      if (!points) return;

      scoreTarget += points;
      showScorePopup(points);
    }

    function updateScoreUI(deltaSeconds) {
      if (!scoreValueElement) return;

      const difference = scoreTarget - scoreCurrent;
      if (difference <= 0) {
        if (scoreValueElement.textContent !== formatScore(scoreCurrent)) {
          scoreValueElement.textContent = formatScore(scoreCurrent);
        }
        return;
      }

      const step = Math.max(1, Math.ceil(difference * Math.min(1, deltaSeconds * 8)));
      scoreCurrent = Math.min(scoreCurrent + step, scoreTarget);
      scoreValueElement.textContent = formatScore(scoreCurrent);
    }

    function applyPowerFillColor(level) {
      if (!powerFillElement) return;
      powerFillElement.classList.remove(
        "power-fill-green",
        "power-fill-yellow",
        "power-fill-red",
      );

      if (level > 70) {
        powerFillElement.classList.add("power-fill-green");
      } else if (level >= 40) {
        powerFillElement.classList.add("power-fill-yellow");
      } else {
        powerFillElement.classList.add("power-fill-red");
      }
    }

    function setPowerLevel(level) {
      if (!powerFillElement) return;
      const safeLevel = THREE.MathUtils.clamp(level, 1, 100);
      powerFillElement.style.width = `${safeLevel}%`;
      applyPowerFillColor(safeLevel);
    }

    function schedulePowerCycle() {
      if (!powerFillElement || disposed) return;

      const nextLevel = THREE.MathUtils.randFloat(40, 100);
      setPowerLevel(nextLevel);

      const delayMs = Math.round(THREE.MathUtils.randFloat(2000, 4000));
      powerCycleTimer = window.setTimeout(schedulePowerCycle, delayMs);
    }

    if (scoreValueElement) {
      scoreCurrent = 0;
      scoreTarget = 0;
      scoreValueElement.textContent = "0";
    }

    if (powerFillElement) {
      powerFillElement.style.transition = "width 700ms ease, background-color 300ms ease";
      schedulePowerCycle();
    }

    setShipDestroyedCallback(addScore);

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
      updateShieldRingPosition();
      updateShieldRingVisualState();
      chimneySmokes.forEach((smokeFx) => smokeFx.update());

      updateRadarUI();
      updateShieldUI();
      updateScoreUI(deltaSeconds);

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

      for (let i = activeExplosions.length - 1; i >= 0; i--) {
        const stillAlive = activeExplosions[i].update(deltaSeconds);
        if (!stillAlive) {
          activeExplosions.splice(i, 1);
        }
      }
      updateBarrelExp(deltaSeconds);

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
    window.__BARREL_EXP = barrelExpControls;
    console.log("✅ BARREL_EXP exposed to window.__BARREL_EXP");
    console.log(
      "   Edit position: window.__BARREL_EXP.setPosition(0, -0.5, 0.16, 0.23)",
    );
    console.log("   Edit size: window.__BARREL_EXP.setSize(2.2)");
    animate();

    return () => {
      disposed = true;
      setShipDestroyedCallback(null);
      stopShipsSession(shipSessionId);

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (powerCycleTimer !== null) {
        window.clearTimeout(powerCycleTimer);
      }

      window.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);

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
      if (shieldRing) {
        scene.remove(shieldRing);
        if (shieldRing.geometry) shieldRing.geometry.dispose();
        disposeMaterial(shieldRing.material);
      }
      if (barrelExpSprites.length && gunBarrel) {
        for (const sprite of barrelExpSprites) {
          gunBarrel.remove(sprite);
        }
      }
      if (barrelExpMaterial) {
        disposeMaterial(barrelExpMaterial);
      }
      if (barrelExpTexture) {
        barrelExpTexture.dispose();
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

      if (window.__SHIELD_RING) {
        delete window.__SHIELD_RING;
      }
      if (window.__SHIELD_GLOW) {
        delete window.__SHIELD_GLOW;
      }
      if (window.__BARREL_EXP) {
        delete window.__BARREL_EXP;
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
