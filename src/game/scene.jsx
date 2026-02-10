import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { createChimneySmoke } from "./object/smoke";
import { spawnShip, updateShips, damageShip, getShipMeshes } from "./ships";

function Scene() {
  const mountRef = useRef(null);

  let mouseX = 0;
  let mouseY = 0;

  const baseYaw = -Math.PI / 2; // fixes sideways barrel
  const basePitch = -0.6;

  let targetYaw = mouseX * 0.8;
  let targetPitch = 0;

  let recoilOffset = 0;
  let isRecoiling = false;
  let barrelBaseZ = 0;

  let muzzleFlashLeft = null;
  let muzzleFlashRight = null;
  let muzzleVideo = null;
  let videoTexture = null;

  useEffect(() => {
    console.log("Scene mounted");

    if (!mountRef.current) {
      console.error("Mount ref not available");
      return;
    }
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onDoubleClick = (e) => {
      recoilOffset = 0.2;
      isRecoiling = true;
      // mouse NDC
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      // raycast
      raycaster.setFromCamera(mouse, camera);

      const shipMeshes = getShipMeshes();
      const intersects = raycaster.intersectObjects(shipMeshes, true);

      if (intersects.length > 0) {
        damageShip(intersects[0].object, scene);
        console.log("HIT SHIP"); // 🔥 debug confirmation
      }

      if (muzzleVideo && muzzleFlashLeft && muzzleFlashRight) {
        muzzleVideo.currentTime = 0;

        const playPromise = muzzleVideo.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => console.log("✅ Video playing"))
            .catch((error) => console.error("❌ Video play failed:", error));
        }

        muzzleFlashLeft.visible = true;
        muzzleFlashRight.visible = true;

        setTimeout(() => {
          muzzleFlashLeft.visible = false;
          muzzleFlashRight.visible = false;
        }, 120);
      }
    };

    window.addEventListener("dblclick", onDoubleClick);

    window.addEventListener("mousemove", (e) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = (e.clientY / window.innerHeight) * 2 - 1;
    });

    // SCENE
    const scene = new THREE.Scene();

    // CAMERA
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 10, 20);
    camera.lookAt(0, 0, 0);

    // RENDERER
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x1a1a1a);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);

    // LIGHTING
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const loader = new GLTFLoader();
    spawnShip(scene);
    spawnShip(scene);

    loader.load(
      "/models/terrain.glb",
      (gltf) => {
        const terrain = gltf.scene;
        terrain.scale.set(40, 40, 40);
        terrain.position.set(0, -5, -5);

        terrain.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(terrain);
        console.log("Terrain model loaded");
      },
      undefined,
      (error) => console.error("Error loading terrain", error),
    );

    scene.fog = new THREE.FogExp2(
      0x0a0f1f, // fog color
      0.03, // density (small number!)
    );

    //scene.fog = new THREE.Fog(
    //0x0a0f1f, // fog color
    //20, // start distance
    //0.03,
    // 120, // end distance
    //);

    //CHINY SMOKEEE
    const chimneySmoke = createChimneySmoke(
      scene,
      new THREE.Vector3(12, 0, 0), // vent position
    );

    // SKY DOME
    const skyLoader = new GLTFLoader();
    let skyDome = null;

    skyLoader.load(
      "/models/space.glb",
      (gltf) => {
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
        console.log("✅ Sky dome added");
      },
      undefined,
      (err) => console.error("❌ Sky dome load error", err),
    );

    // GUN GROUP
    const gunGroup = new THREE.Group();
    scene.add(gunGroup);

    const gltfLoader = new GLTFLoader();
    let gunBase = null;
    let gunBarrel = null;

    // GUN BASE
    gltfLoader.load(
      "/models/gun_base.glb",
      (gltf) => {
        gunBase = gltf.scene;
        gunBase.scale.set(12, 12, 12);
        gunBase.position.set(0, 0, 12);
        gunBase.rotation.x = -0.6;

        gunBase.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        gunGroup.add(gunBase);
      },
      undefined,
      (err) => console.error("Gun base load error", err),
    );

    // GUN BARREL
    gltfLoader.load(
      "/models/gun_barrel.glb",
      (gltf) => {
        gunBarrel = gltf.scene;
        gunBarrel.scale.set(8, 8, 8);
        gunBarrel.position.set(0, 0.5, 10);
        barrelBaseZ = gunBarrel.position.z;

        gunBarrel.rotation.x = -0.6;
        gunBarrel.rotation.y = 1;

        gunBarrel.traverse((child) => {
          if (child.isMesh) child.castShadow = true;
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

        muzzleVideo = video;

        muzzleFlashLeft = new THREE.Sprite(muzzleMaterial);
        muzzleFlashLeft.scale.set(2, 2, 1);
        muzzleFlashLeft.position.set(-0.3, 0.2, 0.5);
        muzzleFlashLeft.visible = false;
        gunBarrel.add(muzzleFlashLeft);

        muzzleFlashRight = new THREE.Sprite(muzzleMaterial);
        muzzleFlashRight.scale.set(2, 2, 1);
        muzzleFlashRight.position.set(0.3, 0.2, 0.5);
        muzzleFlashRight.visible = false;
        gunBarrel.add(muzzleFlashRight);
      },
      undefined,
      (err) => console.error("Gun barrel load error", err),
    );

    // VAULT
    const vault = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshStandardMaterial({ color: 0x4444ff, roughness: 0.5 }),
    );
    vault.position.y = 2;
    vault.castShadow = true;
    vault.receiveShadow = true;
    scene.add(vault);

    // SHIELD
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(13, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.3,
        roughness: 0.3,
      }),
    );
    shield.position.y = -5;
    shield.position.z = -10;
    scene.add(shield);

    // ANIMATION
    function animate() {
      updateShips(camera, scene);

      chimneySmoke.update();

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

      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }

    animate();

    return () => {
      if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
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
