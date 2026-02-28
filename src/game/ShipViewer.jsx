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
