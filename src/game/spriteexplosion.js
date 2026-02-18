import * as THREE from "three";

export function createSpriteExplosion(scene, position) {
  const loader = new THREE.TextureLoader();
  const texture = loader.load("/textures/explosion.png"); // your 8x8 sprite sheet

  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / 8, 1 / 8); // 8x8 grid

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.copy(position);
  sprite.scale.set(3, 3, 1);

  scene.add(sprite);

  // Animation variables
  let currentFrame = 0;
  const totalFrames = 64;
  const frameDuration = 0.02; // seconds per frame
  let accumulator = 0;

  function update(delta) {
    accumulator += delta;

    if (accumulator >= frameDuration) {
      accumulator = 0;

      const column = currentFrame % 8;
      const row = Math.floor(currentFrame / 8);

      texture.offset.x = column / 8;
      texture.offset.y = 1 - (row + 1) / 8;

      currentFrame++;

      if (currentFrame >= totalFrames) {
        scene.remove(sprite);
        material.dispose();
        texture.dispose();
        return false; // stop updating
      }
    }

    return true;
  }

  return { update };
}
