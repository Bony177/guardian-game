import Header from "./header";
import Overlay from "./overlay";
import "./style.css";
import { useEffect, useRef } from "react";
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
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    renderer.domElement.style.position = "fixed";
    renderer.domElement.style.top = "0";
    renderer.domElement.style.left = "0";
    renderer.domElement.style.zIndex = "2";
    renderer.domElement.style.pointerEvents = "none";

    if (mountRef.current) {
      mountRef.current.appendChild(renderer.domElement);
    }

    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(-50, 50, 50);
    scene.add(light);

    let animationId;
    const loader = new GLTFLoader();

    // Create turret group
    const turretGroup = new THREE.Group();
    scene.add(turretGroup);

    // Load tower
    loader.load("/models/guntower.glb", (gltf) => {
      const tower = gltf.scene;
      tower.scale.set(2, 2, 2); // adjust if needed
      turretGroup.add(tower);
    });

    // Load barrel
    let barrelModel;

    loader.load("/models/gun_barrel.glb", (gltf) => {
      barrelModel = gltf.scene;
      barrelModel.scale.set(1, 1, 1); // adjust if needed

      // Move barrel slightly upward if needed
      barrelModel.position.set(0, 1, 0);

      turretGroup.add(barrelModel);
    });

    // Position entire turret on right side
    turretGroup.position.set(2, -1, 3);

    function animate() {
      animationId = requestAnimationFrame(animate);

      if (barrelModel) {
        barrelModel.rotation.y += 0.01; // rotate only barrel
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
      <img src="/textures/terrainb.png" className="terrain" />
      <div className="grain" />

      <Header setActiveOverlay={setActiveOverlay} startGame={startGame} />

      <Overlay
        activeOverlay={activeOverlay}
        closeOverlay={closeOverlay}
        currentTab={currentTab}
        handleTabChange={handleTabChange}
      />

      <div className="hero">
        <h1 className="title">SIGNAL BREACH</h1>
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
