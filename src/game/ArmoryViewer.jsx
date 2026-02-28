import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

function disposeMaterial(material) {
  if (!material) return;

  const textureKeys = [
    "map",
    "lightMap",
    "aoMap",
    "emissiveMap",
    "bumpMap",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "alphaMap",
  ];

  for (const key of textureKeys) {
    if (material[key]) {
      material[key].dispose?.();
    }
  }

  material.dispose?.();
}

function disposeModel(model) {
  if (!model) return;

  model.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((mat) => disposeMaterial(mat));
    } else {
      disposeMaterial(child.material);
    }
  });
}

function ArmoryViewer() {
  const mountRef = useRef(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);
    camera.position.set(0.9, 1.6, 5.1);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(4, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x7be8ff, 1.1);
    fillLight.position.set(-4, 2, -4);
    scene.add(fillLight);

    const barrelAccent = new THREE.PointLight(0xff7a00, 3.2, 12, 2);
    barrelAccent.position.set(0.5, 2.1, 2.5);
    scene.add(barrelAccent);

    const turretGroup = new THREE.Group();
    turretGroup.position.set(0.9, -1.05, 0);
    turretGroup.rotation.y = -0.38;
    turretGroup.scale.set(2.5, 2.5, 2.5);
    scene.add(turretGroup);

    const emissiveTexture = new THREE.TextureLoader().load(
      "/textures/gunemap.jpg",
    );
    emissiveTexture.flipY = false;

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    const loader = new GLTFLoader();
    let towerModel = null;
    let barrelModel = null;

    loader.load(
      "/models/guntower.glb",
      (gltf) => {
        setLoadError("");
        towerModel = gltf.scene;
        towerModel.scale.set(2, 3, 2);
        towerModel.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = child.material.clone();
          child.material.emissiveMap = emissiveTexture;
          child.material.emissive = new THREE.Color(0xffffff);
          child.material.emissiveIntensity = 0;
          child.material.needsUpdate = true;
        });
        turretGroup.add(towerModel);
      },
      undefined,
      () => setLoadError("Failed to load armory models"),
    );

    loader.load(
      "/models/gun_barrel.glb",
      (gltf) => {
        setLoadError("");
        barrelModel = gltf.scene;
        barrelModel.scale.set(1, 1, 1);
        barrelModel.position.set(-0.12, 1.28, 0.05);
        barrelModel.traverse((child) => {
          if (!child.isMesh || !child.material) return;
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = child.material.clone();
          child.material.emissiveMap = emissiveTexture;
          child.material.emissive = new THREE.Color(0xff7a00);
          child.material.emissiveIntensity = 5.5;
          child.material.needsUpdate = true;
        });
        turretGroup.add(barrelModel);
      },
      undefined,
      () => setLoadError("Failed to load armory models"),
    );

    const clock = new THREE.Clock();
    let frameId = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (barrelModel) {
        const maxAngle = 0.9;
        const sweepSpeed = 0.7;
        barrelModel.rotation.x = 0;
        barrelModel.rotation.y = Math.sin(t * sweepSpeed) * maxAngle;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();

      disposeModel(towerModel);
      disposeModel(barrelModel);
      emissiveTexture.dispose();

      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="ship-viewer" ref={mountRef}>
      {loadError && <p className="ship-viewer-error">{loadError}</p>}
    </div>
  );
}

export default ArmoryViewer;
