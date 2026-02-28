import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

function ShipViewer({ modelPath }) {
  const mountRef = useRef(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 0, 8);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 2.3);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    keyLight.position.set(5, 5, 5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7fc7ff, 0.9);
    rimLight.position.set(-4, 2, -4);
    scene.add(rimLight);

    const backLight = new THREE.PointLight(0x45d9ff, 2.2, 0, 2);
    backLight.position.set(0, 0, -6);
    scene.add(backLight);

    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const glowCtx = glowCanvas.getContext("2d");
    if (glowCtx) {
      const gradient = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
      gradient.addColorStop(0, "rgba(205,245,255,1)");
      gradient.addColorStop(0.3, "rgba(120,220,255,0.82)");
      gradient.addColorStop(0.6, "rgba(35,120,255,0.35)");
      gradient.addColorStop(1, "rgba(5,20,45,0)");
      glowCtx.fillStyle = gradient;
      glowCtx.fillRect(0, 0, 256, 256);
    }

    const backGlowTexture = new THREE.CanvasTexture(glowCanvas);
    backGlowTexture.colorSpace = THREE.SRGBColorSpace;
    const backGlowMaterial = new THREE.SpriteMaterial({
      map: backGlowTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.35,
    });
    const backGlow = new THREE.Sprite(backGlowMaterial);
    backGlow.position.set(0, 0, -6.2);
    backGlow.scale.set(9, 6.6, 1);
    scene.add(backGlow);
    const baseBackGlowPos = new THREE.Vector3(0, 0, -6.2);
    const baseBackGlowScale = new THREE.Vector3(9, 6.6, 1);
    let baseBackLightIntensity = 2.2;
    let baseBackGlowOpacity = 0.32;

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
    let model = null;

    loader.load(
      modelPath,
      (gltf) => {
        setLoadError("");
        model = gltf.scene;

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;

        model.position.sub(center);
        scene.add(model);

        const fov = THREE.MathUtils.degToRad(camera.fov);
        const distance = (maxDim * 0.7) / Math.tan(fov / 2);

        camera.near = Math.max(0.1, distance / 100);
        camera.far = distance * 100;
        camera.position.set(maxDim * 0.2, maxDim * 0.08, distance);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        backLight.position.set(0, maxDim * 0.06, -maxDim * 1.2);
        baseBackLightIntensity = 1.8 + maxDim * 0.18;
        backLight.intensity = baseBackLightIntensity;

        baseBackGlowPos.set(0, maxDim * 0.04, -maxDim * 1.15);
        baseBackGlowScale.set(maxDim * 3.1, maxDim * 2.25, 1);
        backGlow.position.copy(baseBackGlowPos);
        backGlow.scale.copy(baseBackGlowScale);
        baseBackGlowOpacity = 0.28;
      },
      undefined,
      (error) => {
        console.error(error);
        setLoadError("Failed to load model");
      },
    );

    let frameId = 0;

    const animate = () => {
      frameId = requestAnimationFrame(animate);

      if (model) {
        model.rotation.y += 0.005;
      }

      const time = performance.now() * 0.001;
      const glowPulse = 0.74 + Math.sin(time * 2.4) * 0.26;
      const lightPulse = 0.8 + Math.sin(time * 1.7 + 0.8) * 0.2;
      const scalePulse = 0.95 + Math.sin(time * 1.9) * 0.07;

      backLight.intensity = baseBackLightIntensity * lightPulse;
      backGlowMaterial.opacity = baseBackGlowOpacity * glowPulse;
      backGlow.scale.set(
        baseBackGlowScale.x * scalePulse,
        baseBackGlowScale.y * scalePulse,
        1,
      );
      backGlow.position.x = baseBackGlowPos.x + Math.sin(time * 0.75) * 0.04;
      backGlow.position.y = baseBackGlowPos.y + Math.cos(time * 1.05) * 0.03;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();

      if (model) {
        model.traverse((child) => {
          if (!child.isMesh) return;
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat?.dispose?.());
          } else {
            child.material?.dispose?.();
          }
        });
      }

      backGlowTexture.dispose();
      backGlowMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [modelPath]);

  return (
    <div className="ship-viewer" ref={mountRef}>
      {loadError && <p className="ship-viewer-error">{loadError}</p>}
    </div>
  );
}

export default ShipViewer;
