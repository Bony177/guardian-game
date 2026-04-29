import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { createChimneySmoke } from "./object/smoke";
import { createSpriteExplosion } from "./spriteexplosion";
import HUD from "./HUD";

import {
  spawnShip,
  updateShips,
  damageShip,
  getShipMeshes,
  getActiveShipCount,
  preloadShipModels,
  setShipsLoadingManager,
  startShipsSession,
  stopShipsSession,
  resetShips,
  setShipDestroyedCallback,
  setMaxShipsPerSession,
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

const BARREL_FIRE_TRACE_DEFAULTS = {
  glowRadius: 0.24,
  coreRadius: 0.11,
  radialSegments: 12,
  lifetimeSeconds: 0.12,
};

const MISSION_KILL_TARGET = 25;
const GAME_AUDIO_VOLUMES = {
  gunfire: 0.74,
  backgroundMusic: 0.5,
  shieldBreak: 0.8,
  shieldRegenerate: 1,
  shipDown: 1,
  gameOver: 0.95,
};

function Scene({ onBackHome, onPlayAgain }) {
  const mountRef = useRef(null);
  const [score, setScore] = useState(0);
  const [killCount, setKillCount] = useState(0);
  const [enemyCount, setEnemyCount] = useState(0);
  const [shieldPercent, setShieldPercent] = useState(100);
  const [vaultPercent, setVaultPercent] = useState(100);
  const [shieldRegenPercent, setShieldRegenPercent] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isMissionComplete, setIsMissionComplete] = useState(false);
  const [isSceneLoading, setIsSceneLoading] = useState(true);
  const [sceneLoadingProgress, setSceneLoadingProgress] = useState(0);
  const [sceneLoadingMessage, setSceneLoadingMessage] = useState(
    "Preparing battlefield assets...",
  );

  useEffect(() => {
    if (!mountRef.current) return undefined;
    const mountNode = mountRef.current;

    console.log("Scene mounted");
    setScore(0);
    setKillCount(0);
    setEnemyCount(0);
    setShieldPercent(100);
    setVaultPercent(100);
    setShieldRegenPercent(0);
    setIsGameOver(false);
    setIsMissionComplete(false);
    setSceneLoadingProgress(0);
    setSceneLoadingMessage("Preparing battlefield assets...");
    setIsSceneLoading(true);

    let disposed = false;
    let rafId = null;
    let hasStartedGameplay = false;
    let managerFinished = false;
    let shipsPreloaded = false;
    let loadingFailed = false;
    // 🎵 Background Music
    let bgMusic = null;
    let bgMusicStarted = false;
    let shieldBreakAudio = null;
    let shieldRegenerateAudio = null;
    let shipDownAudio = null;
    let gameOverAudio = null;
    let shieldBreakPlayed = false; // prevent multiple plays
    let lastRadarCount = -1;
    let lastShieldPercent = -1;
    let lastVaultPercent = 100;
    let lastShieldRegenValue = -1;
    let vaultHealth = 100;
    let shieldRegenValue = 0;
    let gameOverTriggered = false;
    let missionCompleteTriggered = false;
    let gameplayEnded = false;
    let killsTotal = 0;
    const SHIELD_REGEN_RATE_PER_SECOND = 5;
    const VAULT_DAMAGE_MULTIPLIER = 0.7;
    const activeExplosions = [];
    const activeFireTraces = [];

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
    const loadingManager = new THREE.LoadingManager();
    const managedTextureLoader = new THREE.TextureLoader(loadingManager);
    const managedGltfLoader = new GLTFLoader(loadingManager);

    function updateSceneLoadProgress(itemsLoaded = 0, itemsTotal = 0) {
      if (disposed || loadingFailed) return;
      if (!itemsTotal) return;
      const nextPercent = Math.round(
        THREE.MathUtils.clamp((itemsLoaded / itemsTotal) * 100, 0, 100),
      );
      setSceneLoadingProgress((prev) =>
        nextPercent > prev ? nextPercent : prev,
      );
    }

    function tryStartGameplay() {
      if (disposed || hasStartedGameplay || loadingFailed) return;
      if (!managerFinished) return;

      hasStartedGameplay = true;
      setSceneLoadingProgress(100);
      setSceneLoadingMessage("Launch complete");
      setIsSceneLoading(false);

      spawnShip(scene, camera, shipSessionId);
      spawnShip(scene, camera, shipSessionId);

      console.log("Starting animation loop");
      window.__BARREL_EXP = barrelExpControls;
      console.log("BARREL_EXP exposed to window.__BARREL_EXP");
      console.log(
        "   Edit position: window.__BARREL_EXP.setPosition(0, -0.5, 0.16, 0.23)",
      );
      console.log("   Edit size: window.__BARREL_EXP.setSize(2.2)");
      animate();
    }

    loadingManager.onStart = (_, itemsLoaded, itemsTotal) => {
      managerFinished = false;
      if (disposed || loadingFailed) return;
      setSceneLoadingMessage("double tap to fire...");
      updateSceneLoadProgress(itemsLoaded, itemsTotal);
    };

    loadingManager.onProgress = (_, itemsLoaded, itemsTotal) => {
      if (disposed || loadingFailed) return;
      updateSceneLoadProgress(itemsLoaded, itemsTotal);
    };

    loadingManager.onLoad = () => {
      managerFinished = true;
      if (disposed || loadingFailed) return;
      setSceneLoadingProgress((prev) => Math.max(prev, 95));
      setSceneLoadingMessage("Finalizing scene...");
      tryStartGameplay();
    };

    loadingManager.onError = (url) => {
      if (disposed) return;
      loadingFailed = true;
      console.error("Asset failed to load:", url);
      setSceneLoadingMessage("Failed to load assets. Please try again.");
    };

    const clock = new THREE.Clock();
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const shipSessionId = startShipsSession();
    setMaxShipsPerSession(MISSION_KILL_TARGET);
    const scoreByShipType = {
      1: 100,
      2: 200,
      3: 3000,
    };
    const barrelExpState = {
      isPlaying: false,
      elapsed: 0,
      frame: 0,
      frameDuration: 1 / 24,
      totalFrames: 16,
      columns: 4,
      rows: 4,
    };
    const activeGunfireAudios = [];
    let gunfireAudioBase = null;
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

    function initGunfireAudio() {
      if (typeof Audio === "undefined") return;
      gunfireAudioBase = new Audio("/audio/gunfire.m4a");
      gunfireAudioBase.preload = "auto";
      gunfireAudioBase.volume = GAME_AUDIO_VOLUMES.gunfire;
      gunfireAudioBase.load();
    }

    function playEffectAudio(audio, label) {
      if (!audio) return;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((error) => {
          console.warn(`Unable to play ${label} audio`, error);
        });
      }
    }

    function playGunfireAudio() {
      if (!gunfireAudioBase) return;

      let shotAudio = gunfireAudioBase;
      try {
        shotAudio = gunfireAudioBase.cloneNode(true);
        shotAudio.volume = gunfireAudioBase.volume;
      } catch {
        shotAudio = gunfireAudioBase;
      }

      const releaseAudio = () => {
        const index = activeGunfireAudios.indexOf(shotAudio);
        if (index !== -1) activeGunfireAudios.splice(index, 1);
        shotAudio.removeEventListener("ended", releaseAudio);
        shotAudio.removeEventListener("error", releaseAudio);
      };

      shotAudio.currentTime = 0;
      shotAudio.addEventListener("ended", releaseAudio);
      shotAudio.addEventListener("error", releaseAudio);
      activeGunfireAudios.push(shotAudio);

      const playResult = shotAudio.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch((error) => {
          console.warn("Unable to play gunfire audio", error);
          releaseAudio();
        });
      }
    }

    initGunfireAudio();
    function initBackgroundMusic() {
      if (typeof Audio === "undefined") return;

      bgMusic = new Audio("/audio/waveloom-no-copyright-metal-background.mp3"); // <-- put your song file here
      bgMusic.loop = true;
      bgMusic.volume = GAME_AUDIO_VOLUMES.backgroundMusic;
      bgMusic.preload = "auto";
      bgMusic.load();
    }

    initBackgroundMusic();

    function initShieldBreakAudio() {
      if (typeof Audio === "undefined") return;

      shieldBreakAudio = new Audio("/audio/shieldlol.mp3");
      shieldBreakAudio.preload = "auto";
      shieldBreakAudio.volume = GAME_AUDIO_VOLUMES.shieldBreak;
      shieldBreakAudio.load();
    }

    function initShieldRegenerateAudio() {
      if (typeof Audio === "undefined") return;

      shieldRegenerateAudio = new Audio("/audio/shield_regenerate.mp3");
      shieldRegenerateAudio.preload = "auto";
      shieldRegenerateAudio.volume = GAME_AUDIO_VOLUMES.shieldRegenerate;
      shieldRegenerateAudio.load();
    }

    function initShipDownAudio() {
      if (typeof Audio === "undefined") return;

      shipDownAudio = new Audio("/audio/shipdown.mp3");
      shipDownAudio.preload = "auto";
      shipDownAudio.volume = GAME_AUDIO_VOLUMES.shipDown;
      shipDownAudio.load();
    }

    function initGameOverAudio() {
      if (typeof Audio === "undefined") return;

      gameOverAudio = new Audio("/audio/gameover.mp3");
      gameOverAudio.preload = "auto";
      gameOverAudio.volume = GAME_AUDIO_VOLUMES.gameOver;
      gameOverAudio.load();
    }

    initShieldBreakAudio();
    initShieldRegenerateAudio();
    initShipDownAudio();
    initGameOverAudio();

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

    function createBarrelFireTrace(startWorld, endWorld) {
      if (!scene) return;

      const direction = new THREE.Vector3().subVectors(endWorld, startWorld);
      const length = direction.length();
      if (length <= 0.001) return;

      const traceGroup = new THREE.Group();

      const glowGeometry = new THREE.CylinderGeometry(
        BARREL_FIRE_TRACE_DEFAULTS.glowRadius,
        BARREL_FIRE_TRACE_DEFAULTS.glowRadius,
        length,
        BARREL_FIRE_TRACE_DEFAULTS.radialSegments,
      );
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xff7a00,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
      glowMesh.renderOrder = 75;
      traceGroup.add(glowMesh);

      const coreGeometry = new THREE.CylinderGeometry(
        BARREL_FIRE_TRACE_DEFAULTS.coreRadius,
        BARREL_FIRE_TRACE_DEFAULTS.coreRadius,
        length,
        BARREL_FIRE_TRACE_DEFAULTS.radialSegments,
      );
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: 0xfff6df,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
      coreMesh.renderOrder = 76;
      traceGroup.add(coreMesh);

      traceGroup.position.copy(startWorld).add(endWorld).multiplyScalar(0.5);
      traceGroup.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );

      scene.add(traceGroup);

      activeFireTraces.push({
        group: traceGroup,
        glowGeometry,
        coreGeometry,
        glowMaterial,
        coreMaterial,
        elapsed: 0,
        lifetime: BARREL_FIRE_TRACE_DEFAULTS.lifetimeSeconds,
      });
    }

    function createBarrelFireTracesToTarget(hitPoint) {
      if (!gunBarrel) return;

      gunBarrel.updateWorldMatrix(true, false);

      const muzzlePositions =
        barrelExpControls.positions?.length > 0
          ? barrelExpControls.positions
          : BARREL_EXP_DEFAULTS.positions;

      const muzzles = muzzlePositions.slice(0, 2);

      if (!muzzles.length) {
        const fallbackStart = gunBarrel.getWorldPosition(new THREE.Vector3());
        createBarrelFireTrace(fallbackStart, hitPoint);
        return;
      }

      for (const muzzle of muzzles) {
        const localMuzzle = new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z);
        const worldMuzzle = gunBarrel.localToWorld(localMuzzle);
        createBarrelFireTrace(worldMuzzle, hitPoint);
      }
    }

    function updateBarrelFireTraces(deltaSeconds) {
      if (!activeFireTraces.length) return;

      for (let i = activeFireTraces.length - 1; i >= 0; i -= 1) {
        const trace = activeFireTraces[i];
        trace.elapsed += deltaSeconds;

        const t = THREE.MathUtils.clamp(trace.elapsed / trace.lifetime, 0, 1);
        const fade = 1 - t;

        trace.coreMaterial.opacity = fade;
        trace.glowMaterial.opacity = 0.5 * fade;

        if (t >= 1) {
          if (trace.group.parent) trace.group.parent.remove(trace.group);
          trace.glowGeometry.dispose();
          trace.coreGeometry.dispose();
          trace.glowMaterial.dispose();
          trace.coreMaterial.dispose();
          activeFireTraces.splice(i, 1);
        }
      }
    }

    function clearBarrelFireTraces() {
      for (const trace of activeFireTraces) {
        if (trace.group?.parent) trace.group.parent.remove(trace.group);
        trace.glowGeometry?.dispose?.();
        trace.coreGeometry?.dispose?.();
        trace.glowMaterial?.dispose?.();
        trace.coreMaterial?.dispose?.();
      }
      activeFireTraces.length = 0;
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
      if (
        !scene ||
        !camera ||
        disposed ||
        gameplayEnded ||
        !hasStartedGameplay
      ) {
        return;
      }

      recoilOffset = 0.2;
      isRecoiling = true;
      playGunfireAudio();

      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      const shipMeshes = getShipMeshes();
      const intersects = raycaster.intersectObjects(shipMeshes, true);

      if (intersects.length > 0) {
        const hitObject = intersects[0].object;
        const hitPoint = intersects[0].point.clone();

        if (gunBarrel) {
          createBarrelFireTracesToTarget(hitPoint);
        }

        damageShip(hitObject);

        const explosion = createSpriteExplosion(scene, hitPoint);
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

    backgroundTexture = managedTextureLoader.load("/textures/nightsky.jpg");
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
    shield.takeFallbackDamage = applyVaultDamage;
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
      createChimneySmoke(scene, {
        ...config,
        textureLoader: managedTextureLoader,
      }),
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

    const mistTexture = managedTextureLoader.load("/textures/mist_circle.png");

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

    const mistTexturer = managedTextureLoader.load("/textures/mist_circle.png");

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

    const loader = managedGltfLoader;

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

        const expTexture = managedTextureLoader.load("/textures/EXP.png");
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

    const vaultLoader = managedGltfLoader;

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

    const gltfLoader = managedGltfLoader;
    function _loadBuilding(path, position, scale, rotationY = Math.PI) {
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

    setShipsLoadingManager(loadingManager);
    preloadShipModels()
      .then(() => {
        shipsPreloaded = true;
        if (disposed || loadingFailed) return;
        setSceneLoadingMessage("Double Tap to Fire...");
        tryStartGameplay();
      })
      .catch((error) => {
        if (disposed) return;
        loadingFailed = true;
        console.error("Failed to preload ship models", error);
        setSceneLoadingMessage("Failed to load ship models. Please try again.");
      });

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
        setEnemyCount(count);
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

      setShieldPercent(percent);
    }

    function updateVaultUI() {
      const percent = Math.round(THREE.MathUtils.clamp(vaultHealth, 0, 100));
      if (percent === lastVaultPercent) return;
      lastVaultPercent = percent;
      setVaultPercent(percent);
    }

    function updateShieldRegenUI() {
      const percent = Math.round(
        THREE.MathUtils.clamp(shieldRegenValue, 0, 100),
      );
      if (percent === lastShieldRegenValue) return;
      lastShieldRegenValue = percent;
      setShieldRegenPercent(percent);
    }

    function stopRuntimeSystems() {
      gameplayEnded = true;
      window.removeEventListener("dblclick", onDoubleClick);
      window.removeEventListener("mousemove", onMouseMove);

      for (const audio of activeGunfireAudios) {
        audio.pause();
        audio.currentTime = 0;
      }
      activeGunfireAudios.length = 0;

      if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
      }
      bgMusicStarted = false;

      if (shieldBreakAudio) {
        shieldBreakAudio.pause();
        shieldBreakAudio.currentTime = 0;
      }
      if (shieldRegenerateAudio) {
        shieldRegenerateAudio.pause();
        shieldRegenerateAudio.currentTime = 0;
      }
      if (shipDownAudio) {
        shipDownAudio.pause();
        shipDownAudio.currentTime = 0;
      }

      if (gunfireAudioBase) {
        gunfireAudioBase.pause();
        gunfireAudioBase.currentTime = 0;
      }

      clearBarrelFireTraces();
      isRecoiling = false;
      recoilOffset = 0;
      barrelExpState.isPlaying = false;
      for (const sprite of barrelExpSprites) {
        sprite.visible = false;
      }
    }

    function triggerGameOver() {
      if (gameOverTriggered || missionCompleteTriggered || gameplayEnded)
        return;
      gameOverTriggered = true;

      vaultHealth = 0;
      lastVaultPercent = 0;
      shieldRegenValue = 0;
      lastShieldRegenValue = 0;

      setVaultPercent(0);
      setShieldRegenPercent(0);
      setEnemyCount(0);
      setIsGameOver(true);
      playEffectAudio(gameOverAudio, "game over");

      stopRuntimeSystems();
      setShipDestroyedCallback(null);
      stopShipsSession(shipSessionId);
      resetShips();
    }

    function triggerMissionComplete() {
      if (missionCompleteTriggered || gameOverTriggered || gameplayEnded)
        return;
      missionCompleteTriggered = true;

      setEnemyCount(0);
      setIsMissionComplete(true);

      stopRuntimeSystems();
      setShipDestroyedCallback(null);
      stopShipsSession(shipSessionId);
      resetShips();
    }

    function applyVaultDamage(amount) {
      if (gameOverTriggered || missionCompleteTriggered || gameplayEnded)
        return;

      const safeAmount = Number(amount);
      if (!Number.isFinite(safeAmount) || safeAmount <= 0) return;

      vaultHealth = Math.max(
        0,
        vaultHealth - safeAmount * VAULT_DAMAGE_MULTIPLIER,
      );
      updateVaultUI();

      if (vaultHealth <= 0) {
        triggerGameOver();
      }
    }

    function showScorePopup(points) {
      // Score popups are still needed for visual feedback in the DOM
      // Find the score box in the rendered HUD
      const scoreBox = document.querySelector(".score-box");
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
      if (gameOverTriggered || missionCompleteTriggered || gameplayEnded)
        return;
      const points = scoreByShipType[shipType] ?? 0;
      if (!points) return;

      playEffectAudio(shipDownAudio, "ship down");
      killsTotal += 1;
      setScore((prevScore) => prevScore + points);
      setKillCount(killsTotal);
      showScorePopup(points);

      if (killsTotal >= MISSION_KILL_TARGET) {
        triggerMissionComplete();
      }
    }

    setShipDestroyedCallback(addScore);

    function animate() {
      if (disposed || gameplayEnded) return;
      rafId = window.requestAnimationFrame(animate);

      const deltaMs = clock.getDelta() * 1000;
      const deltaSeconds = deltaMs / 1000;

      updateShips(camera, scene, deltaMs, shield, shipSessionId);
      if (gameplayEnded) return;
      // 🎵 Start music when first ship appears
      if (!bgMusicStarted && getActiveShipCount() > 0) {
        bgMusicStarted = true;

        if (bgMusic) {
          const playPromise = bgMusic.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch((err) => {
              console.warn("Autoplay blocked until user interaction", err);
            });
          }
        }
      }
      // 🎥 Camera shake when shield destroyed
      if (shield.isDestroyed && shield.destroyTimer < 1.3) {
        const shakeAmount = 0.15 * (1 - shield.destroyTimer / 1.3);
        camera.position.x += (Math.random() - 0.5) * shakeAmount;
        camera.position.y += (Math.random() - 0.5) * shakeAmount;
      }

      shield.update(deltaSeconds);
      // 🔊 Play shield break sound ONCE
      if (shield.isDestroyed && !shieldBreakPlayed) {
        shieldBreakPlayed = true;

        if (shieldBreakAudio) {
          shieldBreakAudio.currentTime = 0;
          const playPromise = shieldBreakAudio.play();
          if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch((err) => {
              console.warn("Shield break audio blocked", err);
            });
          }
        }
      }
      if (!shield.isDestroyed) {
        shieldBreakPlayed = false;
      }

      if (shield.isDestroyed) {
        shieldRegenValue = Math.min(
          100,
          shieldRegenValue + SHIELD_REGEN_RATE_PER_SECOND * deltaSeconds,
        );
        updateShieldRegenUI();

        if (shieldRegenValue >= 100) {
          playEffectAudio(shieldRegenerateAudio, "shield regenerate");
          if (typeof shield.restore === "function") {
            shield.restore();
          }
          shieldRegenValue = 0;
          lastShieldRegenValue = 0;
          setShieldRegenPercent(0);
        }
      } else if (shieldRegenValue > 0 || lastShieldRegenValue !== 0) {
        shieldRegenValue = 0;
        lastShieldRegenValue = 0;
        setShieldRegenPercent(0);
      }
      updateShieldRingPosition();
      updateShieldRingVisualState();
      chimneySmokes.forEach((smokeFx) => smokeFx.update());

      updateRadarUI();
      updateShieldUI();
      updateVaultUI();

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
      updateBarrelFireTraces(deltaSeconds);

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

    return () => {
      disposed = true;
      setShipDestroyedCallback(null);
      stopShipsSession(shipSessionId);
      setShipsLoadingManager();
      setMaxShipsPerSession();

      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
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
      for (const audio of activeGunfireAudios) {
        audio.pause();
        audio.currentTime = 0;
      }
      activeGunfireAudios.length = 0;
      // Stop background music
      if (bgMusic) {
        bgMusic.pause();
        bgMusic.currentTime = 0;
        bgMusic = null;
      }
      // Stop shield break audio
      if (shieldBreakAudio) {
        shieldBreakAudio.pause();
        shieldBreakAudio.currentTime = 0;
        shieldBreakAudio = null;
      }
      if (shieldRegenerateAudio) {
        shieldRegenerateAudio.pause();
        shieldRegenerateAudio.currentTime = 0;
        shieldRegenerateAudio = null;
      }
      if (shipDownAudio) {
        shipDownAudio.pause();
        shipDownAudio.currentTime = 0;
        shipDownAudio = null;
      }
      if (gameOverAudio) {
        gameOverAudio.pause();
        gameOverAudio.currentTime = 0;
        gameOverAudio = null;
      }
      if (gunfireAudioBase) {
        gunfireAudioBase.pause();
        gunfireAudioBase.currentTime = 0;
        gunfireAudioBase = null;
      }
      clearBarrelFireTraces();
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

  const showShieldDownHud = shieldPercent <= 0 || shieldRegenPercent > 0;
  const safeLoadingPercent = Math.round(
    THREE.MathUtils.clamp(sceneLoadingProgress, 0, 100),
  );

  return (
    <>
      {!isSceneLoading ? (
        <HUD
          score={score}
          killCount={killCount}
          enemyCount={enemyCount}
          shieldPercent={shieldPercent}
          vaultPercent={vaultPercent}
          shieldRegenPercent={shieldRegenPercent}
          showShieldRegen={showShieldDownHud}
        />
      ) : null}
      <div
        ref={mountRef}
        style={{
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
        }}
      />
      {isSceneLoading ? (
        <div className="scene-loading-overlay" role="status" aria-live="polite">
          <div className="scene-loading-panel">
            <p className="scene-loading-label">{sceneLoadingMessage}</p>
            <p className="scene-loading-percent">{safeLoadingPercent}%</p>
            <div className="scene-loading-bar">
              <div
                className="scene-loading-fill"
                style={{ width: `${safeLoadingPercent}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
      {isMissionComplete ? (
        <div className="mission-complete-overlay">
          <div className="mission-complete-card">
            <h2>SECTOR SECURED</h2>
            <p>Hostile fleet neutralized.</p>
            <p className="mission-complete-copy">
              You successfully defended Eclipse-7
              <br />
              and protected one of the last human settlements on Earth.
            </p>
            <p className="vault-fail-score">SCORE: {score.toLocaleString()}</p>
            <div className="vault-fail-actions">
              <button
                type="button"
                className="vault-fail-btn secondary"
                onClick={() => {
                  if (typeof onBackHome === "function") onBackHome();
                }}
              >
                Back To Home
              </button>
              <button
                type="button"
                className="vault-fail-btn primary"
                onClick={() => {
                  if (typeof onPlayAgain === "function") onPlayAgain();
                }}
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isGameOver ? (
        <div className="vault-fail-overlay">
          <div className="vault-fail-card">
            <h2>GAME OVER</h2>
            <p>You failed to save the sector and guard the vault.</p>
            <p className="vault-fail-score">SCORE: {score.toLocaleString()}</p>
            <div className="vault-fail-actions">
              <button
                type="button"
                className="vault-fail-btn secondary"
                onClick={() => {
                  if (typeof onBackHome === "function") onBackHome();
                }}
              >
                Back To Home
              </button>
              <button
                type="button"
                className="vault-fail-btn primary"
                onClick={() => {
                  if (typeof onPlayAgain === "function") onPlayAgain();
                }}
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default Scene;
