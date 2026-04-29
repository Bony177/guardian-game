import Header from "./header";
import Overlay from "./overlay";
import "./style.css";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import Sandbox from "./stars";
import SkyLightning from "./SkyLightning";

function Landing({
  activeOverlay,
  setActiveOverlay,
  closeOverlay,
  startGame,
  currentTab,
  handleTabChange,
}) {
  const mountRef = useRef(null);
  const barrelAudioRef = useRef(null);
  const bgmAudioRef = useRef(null);
  const headerHoverAudioRef = useRef(null);
  const headerClickAudioRef = useRef(null);
  const hoverAudioRef = useRef(null);
  const clickAudioRef = useRef(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  useEffect(() => {
    const unlockAudio = () => {
      const allAudios = [
        headerHoverAudioRef.current,
        headerClickAudioRef.current,
        hoverAudioRef.current,
        clickAudioRef.current,
        barrelAudioRef.current,
        bgmAudioRef.current,
      ];

      allAudios.forEach((audio) => {
        if (!audio) return;
        audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
          })
          .catch(() => {});
      });

      window.removeEventListener("click", unlockAudio);
    };

    window.addEventListener("click", unlockAudio);

    return () => {
      window.removeEventListener("click", unlockAudio);
    };
  }, []);
  useEffect(() => {
    const headerHoverAudio = new Audio("/audio/header-hover.mp3");
    headerHoverAudio.preload = "auto";
    headerHoverAudio.volume = 1; // subtle

    const headerClickAudio = new Audio("/audio/header-click.mp3");
    headerClickAudio.preload = "auto";
    headerClickAudio.volume = 0.5;

    headerHoverAudioRef.current = headerHoverAudio;
    headerClickAudioRef.current = headerClickAudio;
    const barrelAudio = new Audio("/audio/gunbarrel.m4a");
    const hoverAudio = new Audio("/audio/buttonhover.mp3");
    hoverAudio.preload = "auto";
    hoverAudio.volume = 0.9;

    const clickAudio = new Audio("/audio/buttonclick.mp3");
    clickAudio.preload = "auto";
    clickAudio.volume = 0.8;

    hoverAudioRef.current = hoverAudio;
    clickAudioRef.current = clickAudio;
    barrelAudio.preload = "auto";
    barrelAudio.volume = 0.05;
    barrelAudio.loop = true;

    const bgmAudio = new Audio("/audio/ribhavagrawal-the-beginning.mp3");
    bgmAudio.preload = "auto";
    bgmAudio.loop = true;
    bgmAudio.volume = 0.4;

    barrelAudioRef.current = barrelAudio;
    bgmAudioRef.current = bgmAudio;

    return () => {
      [barrelAudio, bgmAudio, hoverAudio, clickAudio].forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      barrelAudioRef.current = null;
      bgmAudioRef.current = null;
      hoverAudioRef.current = null;
      clickAudioRef.current = null;
    };
  }, []);

  const handleEnter = async () => {
    if (!assetsReady || hasEntered) return;

    setHasEntered(true);
    const barrelAudio = barrelAudioRef.current;
    const bgmAudio = bgmAudioRef.current;

    try {
      if (barrelAudio) {
        barrelAudio.currentTime = 0;
        await barrelAudio.play();
      }
    } catch (error) {
      console.warn("Unable to play barrel audio", error);
    }

    try {
      if (bgmAudio) {
        bgmAudio.currentTime = 0;
        await bgmAudio.play();
      }
    } catch (error) {
      console.warn("Unable to play bgm audio", error);
    }
  };
  const playHoverSound = () => {
    const audio = hoverAudioRef.current;
    if (!audio) return;

    try {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {}
  };

  const playClickSound = () => {
    const audio = clickAudioRef.current;
    if (!audio) return;

    try {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {}
  };
  const playHeaderHoverSound = () => {
    const audio = headerHoverAudioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  const playHeaderClickSound = () => {
    const audio = headerClickAudioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    audio.play().catch(() => {});
  };

  useEffect(() => {
    let isMounted = true;
    const mountNode = mountRef.current;
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

    if (mountNode) {
      mountNode.appendChild(renderer.domElement);
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
    const loadingManager = new THREE.LoadingManager();

    loadingManager.onStart = () => {
      if (!isMounted) return;
      setLoadingProgress(0);
      setAssetsReady(false);
    };
    loadingManager.onProgress = (_, itemsLoaded, itemsTotal) => {
      if (!isMounted || itemsTotal <= 0) return;
      const nextProgress = Math.round((itemsLoaded / itemsTotal) * 100);
      setLoadingProgress(Math.min(nextProgress, 99));
    };
    loadingManager.onLoad = () => {
      if (!isMounted) return;
      setLoadingProgress(100);
      setAssetsReady(true);
    };

    const loader = new GLTFLoader(loadingManager);
    const textureLoader = new THREE.TextureLoader(loadingManager);
    const emissiveTexture = textureLoader.load("/textures/gunemap.jpg");
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
      isMounted = false;
      cancelAnimationFrame(animationId);
      emissiveTexture.dispose();
      renderer.dispose();
      if (mountNode && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="landing">
      {!hasEntered && (
        <div className="loading-screen" role="dialog" aria-modal="true">
          <div className="loading-screen__panel">
            <p className="loading-screen__label">
              {assetsReady ? "SYSTEM READY" : "LOADING 3D ASSETS"}
            </p>
            <p className="loading-screen__percent">{loadingProgress}%</p>
            <div className="loading-screen__bar">
              <div
                className="loading-screen__fill"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            {assetsReady ? (
              <button
                className="loading-screen__enter-btn"
                onMouseEnter={playHoverSound}
                onClick={() => {
                  playClickSound();
                  handleEnter();
                }}
              >
                ENTER
              </button>
            ) : (
              <p className="loading-screen__hint">
                Preparing landing models...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Three.js canvas */}
      <div ref={mountRef} className="three-canvas" />

      {/* Background */}

      <div className="stars-layer">
        <Sandbox />
      </div>
      <div className="sky-lightning-layer">
        <SkyLightning canPlaySound={hasEntered} />
      </div>
      <div className="embers-strip">
        <img src="/textures/sparklee.png" />
      </div>
      <img src="/textures/newterrani.png" className="terrain" />
      <div className="mountain-smoke">
        <img src="/textures/smoke.png" />
      </div>
      <div className="atmosphere-global" />
      <div className="atmosphere" />
      <div className="shield-ground-sphere" aria-hidden="true" />
      <img src="/textures/shield.png" className="shield" />
      <div className="shield-glow-static" />
      <div className="shield-pulse" />
      <div className="grain" />

      <Header
        setActiveOverlay={setActiveOverlay}
        playHeaderHoverSound={playHeaderHoverSound}
        playHeaderClickSound={playHeaderClickSound}
      />

      <Overlay
        activeOverlay={activeOverlay}
        closeOverlay={closeOverlay}
        startGame={startGame}
        currentTab={currentTab}
        handleTabChange={handleTabChange}
      />

      <div className="hero">
        <h1 className="title">
          SIGNAL<br></br> BREACH
        </h1>
        <p className="subtitle">
          HIDDEN BENEATH RUINED EARTH, THE LAST SETTLEMENTS <br></br>SURVIVE IN
          SILENCE. UNTIL A SIGNAL BREACH CALLS THE ENEMY BACK.
        </p>

        <div className="hero-buttons">
          <button
            className="secondary-btn"
            onMouseEnter={playHoverSound}
            onClick={() => {
              playClickSound();
              startGame();
            }}
          >
            PLAY NOW
          </button>
        </div>
      </div>

      <div className="bottom-panels">
        <button
          type="button"
          className="panel-btn"
          onMouseEnter={playHoverSound}
          onClick={() => {
            playClickSound();
            setActiveOverlay("map");
          }}
        >
          <img className="panel-btn-image" src="/textures/MAPNG.png" alt="" />
          <span className="panel-btn-label">MAP</span>
        </button>

        <button
          type="button"
          className="panel-btn"
          onMouseEnter={playHoverSound}
          onClick={() => {
            playClickSound();
            setActiveOverlay("missions");
          }}
        >
          <img className="panel-btn-image" src="/textures/GUNPNG.png" alt="" />
          <span className="panel-btn-label">STORY</span>
        </button>

        <button
          type="button"
          className="panel-btn"
          onMouseEnter={playHoverSound}
          onClick={() => {
            playClickSound();
            setActiveOverlay("hangar");
          }}
        >
          <img className="panel-btn-image" src="/textures/SHIPNG.png" alt="" />
          <span className="panel-btn-label">SHIP HANGAR</span>
        </button>
      </div>
    </div>
  );
}

export default Landing;
