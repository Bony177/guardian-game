import * as THREE from "three";

export function createShield() {
  const shield = {
    health: 100,
    maxHealth: 100,
    object: new THREE.Group(),
    hitFlashTimer: 0,
    baseEmissive: 0.3,
  };

  const geometry = new THREE.SphereGeometry(12, 64, 64);

  const material = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.25,
    emissive: 0x00aaff,
    emissiveIntensity: shield.baseEmissive,
    roughness: 0.2,
    metalness: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const sphere = new THREE.Mesh(geometry, material);

  shield.material = material;
  shield.object.add(sphere);

  shield.show = () => (shield.object.visible = true);
  shield.hide = () => (shield.object.visible = false);

  shield.takeDamage = (amount) => {
    shield.health -= amount;
    shield.health = Math.max(shield.health, 0);
  };

  // ✅ FLASH FUNCTION (now in correct place)
  shield.flash = () => {
    if (!shield.material) return;

    shield.material.emissiveIntensity = 3.0;
    shield.hitFlashTimer = 0.15;
  };

  shield.update = (deltaSeconds) => {
    if (shield.hitFlashTimer > 0) {
      shield.hitFlashTimer -= deltaSeconds;
    } else {
      shield.material.emissiveIntensity = THREE.MathUtils.lerp(
        shield.material.emissiveIntensity,
        shield.baseEmissive,
        0.1,
      );
    }
  };

  return shield;
}
