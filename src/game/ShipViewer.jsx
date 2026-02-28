import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

function ShipViewer({ modelPath }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 1, 5);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(
      mountRef.current.clientWidth,
      mountRef.current.clientHeight,
    );
    renderer.setClearColor(0x000000, 0);

    mountRef.current.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambient);

    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(5, 10, 7);
    scene.add(light);

    const loader = new GLTFLoader();
    let model;

    loader.load(modelPath, (gltf) => {
      model = gltf.scene;
      model.scale.set(2, 2, 2);
      scene.add(model);
    });

    let frameId;

    function animate() {
      frameId = requestAnimationFrame(animate);

      if (model) {
        model.rotation.y += 0.005; // 🔥 auto rotation
      }

      renderer.render(scene, camera);
    }

    animate();

    return () => {
      cancelAnimationFrame(frameId);

      if (renderer) {
        renderer.dispose();
      }

      if (mountRef.current && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [modelPath]);

  return <div className="ship-viewer" ref={mountRef} />;
}

export default ShipViewer;
