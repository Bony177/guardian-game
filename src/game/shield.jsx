import * as THREE from "three";

export function createShield() {
  const radius = 12;
  const shield = {
    health: 100,
    maxHealth: 100,
    object: new THREE.Group(),
    hitFlashTimer: 0,
    baseEmissive: 0.3,
  };

  // True upper hemisphere (dome): theta 0 -> PI/2
  const geometry = new THREE.SphereGeometry(
    radius,
    30,
    30,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );

  const material = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.3,
    emissive: 0x00aaff,
    emissiveIntensity: shield.baseEmissive,
    roughness: 0.2,
    metalness: 0.0,
    // Keep depthTest enabled, but disable depthWrite so transparent shield doesn't occlude later draws
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });

  const sphere = new THREE.Mesh(geometry, material);

  // Render order: buildings (0) -> shield (1) -> gun (2)
  sphere.renderOrder = 1;
  shield.object.renderOrder = 1;

  shield.material = material;
  shield.radius = radius;
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
    shield.material.emissive.set(0xff0000);
    shield.material.emissiveIntensity = 3.0;
    shield.hitFlashTimer = 0.15;
  };

  shield.update = (deltaSeconds) => {
    if (shield.hitFlashTimer > 0) {
      shield.hitFlashTimer -= deltaSeconds;
    } else {
      shield.material.emissive.set(0x00aaff);
      shield.material.emissiveIntensity = THREE.MathUtils.lerp(
        shield.material.emissiveIntensity,
        shield.baseEmissive,
        0.1,
      );
    }
  };

  return shield;
}
