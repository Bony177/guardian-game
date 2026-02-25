import Header from "./header";
import Overlay from "./overlay";
import "./style.css";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

function Landing({
  activeOverlay,
  setActiveOverlay,
  closeOverlay,
  startGame,
  currentTab,
  handleTabChange,
}) {
  const mountRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background
    scene.fog = null; // No fog to hide background

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      transparent: true,
      preserveDrawingBuffer: false,
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Better lighting response
    renderer.physicallyCorrectLights = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    renderer.domElement.style.position = "fixed";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.zIndex = "2";
    renderer.domElement.style.pointerEvents = "none";

    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    // Main directional key light
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(-50, 50, 50);
    light.castShadow = true;
    light.shadow.bias = -0.0005;
    scene.add(light);

    // Ambient fill so dark areas are visible
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    // Point light close to turret to brighten models
    const turretPoint = new THREE.PointLight(0xffffff, 1.7, 10, 2);
    turretPoint.position.set(1, 0.5, 3.6);
    turretPoint.castShadow = true;
    scene.add(turretPoint);

    let animationId;
    const loader = new GLTFLoader();
    const emissiveTexture = new THREE.TextureLoader().load(
      "/textures/gunemap.jpg",
    );
    emissiveTexture.flipY = false;

    // Create turret group
    const turretGroup = new THREE.Group();
    scene.add(turretGroup);

    // Load tower
    loader.load("/models/guntower.glb", (gltf) => {
      const tower = gltf.scene;
      tower.scale.set(2, 3, 2);

      tower.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.emissiveMap = emissiveTexture;
          child.material.emissive = new THREE.Color(0xffffff);
          // boost emissive so tower is more visible
          child.material.emissiveIntensity = 0;
          child.material.needsUpdate = true;
          // allow lighting and shadows
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      turretGroup.add(tower);
    });

    // Load barrel
    let barrelModel;

    loader.load("/models/gun_barrel.glb", (gltf) => {
      barrelModel = gltf.scene;
      barrelModel.scale.set(1, 1, 1);
      barrelModel.position.set(-0.12, 1.28, 0.05);

      barrelModel.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material = child.material.clone();
          child.material.emissiveMap = emissiveTexture;
          child.material.emissive = new THREE.Color(0xff7a00); // orange
          // make barrel glow brighter
          child.material.emissiveIntensity = 6.0;
          child.material.needsUpdate = true;
          // enable shadows on barrel meshes
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      turretGroup.add(barrelModel);
    });
    // Position entire turret on right side
    turretGroup.position.set(2, -1, 3);
    let clock = new THREE.Clock();

    function animate() {
      animationId = requestAnimationFrame(animate);

      if (barrelModel) {
        const t = clock.getElapsedTime();

        const speed = 0.6; // scanning speed
        const maxAngle = 0.9; // left-right range

        // Smooth scan
        const scan = Math.sin(t * speed) * maxAngle;

        barrelModel.rotation.x = 0;
        barrelModel.rotation.y = scan;
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (mountRef.current && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="landing">
      {/* Three.js canvas */}
      <div ref={mountRef} className="three-canvas" />

      {/* Background */}

      <img src="/textures/skyyy.jpg" className="sky" />
      <img src="/textures/newterrani.png" className="terrain" />
      <img src="/textures/shield.png" className="shield" />
      <div className="grain" />

      <Header setActiveOverlay={setActiveOverlay} startGame={startGame} />

      <Overlay
        activeOverlay={activeOverlay}
        closeOverlay={closeOverlay}
        currentTab={currentTab}
        handleTabChange={handleTabChange}
      />

      <div className="hero">
        <h1 className="title">
          SIGNAL<br></br> BREACH
        </h1>
        <p className="subtitle">THE SIGNAL BREACHED SOME SHIT BLAH BLAH</p>

        <div className="hero-buttons">
          <button
            className="primary-btn"
            onClick={() => setActiveOverlay("missions")}
          >
            START MISSION
          </button>

          <button className="secondary-btn" onClick={startGame}>
            QUICK PLAY
          </button>
        </div>
      </div>

      <div className="bottom-panels">
        <div className="card" onClick={() => setActiveOverlay("missions")}>
          MISSIONS
        </div>

        <div className="card" onClick={() => setActiveOverlay("armory")}>
          ARMORY
        </div>

        <div className="card" onClick={() => setActiveOverlay("hangar")}>
          SHIP HANGAR
        </div>
      </div>
    </div>
  );
}

export default Landing;
