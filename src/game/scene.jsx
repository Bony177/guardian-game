import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { createChimneySmoke } from "./object/smoke";
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
  SHIELD: 1,
  GUN: 2,
  FX: 3,
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
    const timeoutIds = [];

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
        damageShip(intersects[0].object);
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

    vaultLoader.load(
      "/models/vault.glb", // <-- put your model path here
      (gltf) => {
        vault = gltf.scene;

        // Adjust scale to fit your world
        vault.scale.set(7, 7, 7);
        vault.rotation.y = Math.PI / 2; // 90° rotate

        // Fixed world position
        vault.position.set(0, 2, 0);
        vault.renderOrder = RENDER_LAYER.BUILDINGS;
        vault.layers.set(RENDER_LAYER.BUILDINGS);

        vault.traverse((child) => {
          child.renderOrder = RENDER_LAYER.BUILDINGS;
          child.layers.set(RENDER_LAYER.BUILDINGS);
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            // optional: better lighting response
            if (child.material) {
              child.material.roughness = 0.6;
              child.material.metalness = 0.2;
            }
          }
        });

        scene.add(vault);
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

          scene.add(model);
          console.log(`Loaded building: ${path}`);
        },
        undefined,
        (err) => console.error(`Error loading building: ${path}`, err),
      );
    }
    loadBuilding("/models/bl5.glb", new THREE.Vector3(4, 3, 4), 4);
    loadBuilding("/models/bl6.glb", new THREE.Vector3(-4, 3, 4), 5);

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

      renderer.clear();
      camera.layers.set(RENDER_LAYER.BUILDINGS);
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
