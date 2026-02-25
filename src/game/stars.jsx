import { useEffect, useRef } from "react";
import * as THREE from "three";

function Sandbox() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ================= SCENE =================
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000010, 0.0005);

    // ================= CAMERA =================
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    camera.position.z = 5;

    // ================= RENDERER =================
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0x000010);
    mount.appendChild(renderer.domElement);

    // ================= STARS =================
    const starCount = 6000;

    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const colors = [];
    const sizes = [];

    for (let i = 0; i < starCount; i++) {
      // Position
      positions.push(
        (Math.random() - 0.5) * 2000,
        (Math.random() - 0.5) * 2000,
        (Math.random() - 0.5) * 2000,
      );

      // Random brightness
      const brightness = 0.7 + Math.random() * 0.3;
      colors.push(brightness, brightness, brightness);

      // Slight size variation
      const size =
        Math.random() < 0.1
          ? 2.2 // 10% slightly bigger stars
          : 1.2; // normal stars

      sizes.push(size);
    }

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);

    // ================= ANIMATION =================
    let animationId;
    let time = 0;

    function animate() {
      animationId = requestAnimationFrame(animate);

      time += 0.002; // slightly faster time

      // 🌌 Slightly faster cosmic drift
      stars.rotation.y += 0.00015;
      stars.rotation.x += 0.00006;
      stars.rotation.z += 0.00002;

      // ✨ Softer but more noticeable fluctuation
      material.opacity = 0.82 + Math.sin(time * 2.0) * 0.05;

      // 🎥 Very subtle camera float
      camera.position.x = Math.sin(time * 0.3) * 0.1;
      camera.position.y = Math.cos(time * 0.25) * 0.1;

      renderer.render(scene, camera);
    }
    animate();

    // ================= RESIZE =================
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }

      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}

export default Sandbox;
