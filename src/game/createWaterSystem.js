import * as THREE from "three";

export function createSimpleWater(scene, terrainObject, options = {}) {
  const config = {
    boundsScale: 1.2,
    levelOffset: 2,
    tiltX: 0,
    color: 0x1e5b8f,
    opacity: 0.82,
    normalMap: "https://threejs.org/examples/textures/waternormals.jpg",
    normalRepeatScale: 60,
    waveSpeed: 0.03,
    roughness: 0.15,
    metalness: 0.9,
    normalStrength: 0.5,
    envMapIntensity: 1.2,
    ...options,
  };

  if (!scene || !terrainObject) return null;

  const bounds = new THREE.Box3().setFromObject(terrainObject);
  if (bounds.isEmpty()) return null;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  const width = size.x * config.boundsScale;
  const depth = size.z * config.boundsScale;

  const geometry = new THREE.PlaneGeometry(width, depth, 1, 1);

  const loader = new THREE.TextureLoader();
  const normalMap = loader.load(config.normalMap, (texture) => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  });

  const repeat = width / config.normalRepeatScale;
  normalMap.repeat.set(repeat, repeat);

  const material = new THREE.MeshStandardMaterial({
    color: config.color,
    transparent: true,
    opacity: config.opacity,
    metalness: config.metalness,
    roughness: config.roughness,
    normalMap,
    normalScale: new THREE.Vector2(config.normalStrength, config.normalStrength),
    envMapIntensity: config.envMapIntensity,
  });

  const water = new THREE.Mesh(geometry, material);
  water.rotation.x = -Math.PI / 2 + config.tiltX;

  const waterLevel = bounds.min.y + config.levelOffset;
  water.position.set(center.x, waterLevel, center.z);

  water.receiveShadow = false;
  water.castShadow = false;

  scene.add(water);

  // Create water ripple particles
  const particleCount = 120;
  const particleGeometry = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = Math.random() * width * 0.4;
    particlePositions[i * 3] = center.x + Math.cos(angle) * radius;
    particlePositions[i * 3 + 1] = waterLevel + Math.random() * 0.3;
    particlePositions[i * 3 + 2] = center.z + Math.sin(angle) * radius;
  }
  
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  
  const particleMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
  });
  
  const particles = new THREE.Points(particleGeometry, particleMaterial);
  particles.layers.set(6);
  scene.add(particles);

  // Particle state
  const particleState = new Array(particleCount).fill(null).map(() => ({
    time: Math.random() * Math.PI * 2,
    speed: 0.5 + Math.random() * 1.5,
    depth: Math.random(),
    angle: Math.random() * Math.PI * 2,
  }));

  function update(delta) {
    // Multi-layer wave animation
    normalMap.offset.x += delta * (config.waveSpeed * 5) * 1.2;
    normalMap.offset.y += delta * (config.waveSpeed * 4) * 1.1;
    
    // Additional ripple layer for more complexity
    const rippleScale = Math.sin(normalMap.offset.x * 2) * 0.05;
    const rippleScale2 = Math.cos(normalMap.offset.y * 1.5) * 0.03;
    material.normalScale.x = config.normalStrength + rippleScale;
    material.normalScale.y = config.normalStrength + rippleScale2;

    // Update particles for ripple effect
    const positions = particles.geometry.attributes.position.array;
    
    for (let i = 0; i < particleCount; i++) {
      const state = particleState[i];
      state.time += delta * state.speed;
      
      const angle = state.angle;
      const radiusPulse = 3 + Math.sin(state.time) * 2;
      const baseX = center.x + Math.cos(angle) * width * 0.35;
      const baseZ = center.z + Math.sin(angle) * depth * 0.35;
      
      const waveHeight = Math.sin(state.time * 2) * 0.2 + Math.cos(state.time * 1.3) * 0.15;
      const bobAmount = Math.sin(state.time + i) * 0.08;
      
      positions[i * 3] = baseX + Math.sin(state.time * 0.8) * 0.5;
      positions[i * 3 + 1] = waterLevel + waveHeight + bobAmount;
      positions[i * 3 + 2] = baseZ + Math.cos(state.time * 0.9) * 0.5;
      
      // Fade particles in and out
      if (state.time > Math.PI * 2) {
        state.time = 0;
        state.angle = Math.random() * Math.PI * 2;
      }
    }
    
    particles.geometry.attributes.position.needsUpdate = true;
    
    // Animate particle opacity based on wave
    particleMaterial.opacity = 0.4 + Math.sin(normalMap.offset.x) * 0.2;
  }

  function dispose() {
    scene.remove(water);
    scene.remove(particles);
    geometry.dispose();
    material.dispose();
    normalMap.dispose();
    particleGeometry.dispose();
    particleMaterial.dispose();
  }

  return {
    water,
    particles,
    update,
    dispose,
  };
}

export { createSimpleWater as createWaterSystem };
export default createSimpleWater;
