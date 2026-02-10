import * as THREE from "three";

export function createChimneySmoke(scene, position = new THREE.Vector3()) {
  const smokeGroup = new THREE.Group();
  smokeGroup.position.copy(position);
  scene.add(smokeGroup);

  const textureLoader = new THREE.TextureLoader();
  const smokeTexture = textureLoader.load("/textures/smoke.png");

  const smokeMaterial = new THREE.SpriteMaterial({
    map: smokeTexture,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });

  const SMOKE_COUNT = 16;
  const smokes = [];

  for (let i = 0; i < SMOKE_COUNT; i++) {
    const sprite = new THREE.Sprite(smokeMaterial.clone());

    resetSmoke(sprite, true);

    smokeGroup.add(sprite);
    smokes.push(sprite);
  }

  function resetSmoke(sprite, randomY = false) {
    sprite.position.set(
      (Math.random() - 0.5) * 0.3,
      randomY ? Math.random() * 2 : 0,
      (Math.random() - 0.5) * 0.3,
    );

    sprite.scale.set(1, 1, 1);
    sprite.material.opacity = 0.4;
    sprite.userData.speed = 0.01 + Math.random() * 0.01;
  }

  function update() {
    smokes.forEach((sprite) => {
      sprite.position.y += sprite.userData.speed;
      sprite.scale.multiplyScalar(1.003);
      sprite.material.opacity -= 0.002;

      // slight sideways drift
      sprite.position.x += (Math.random() - 0.5) * 0.002;
      sprite.position.z += (Math.random() - 0.5) * 0.002;

      if (sprite.material.opacity <= 0) {
        resetSmoke(sprite);
      }
    });
  }

  return { update };
}
