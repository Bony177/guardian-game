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
  shield.isDestroyed = false;
  shield.destroyTimer = 0;
  shield.originalScale = 1;
  shield.shakeIntensity = 0;

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
    if (shield.isDestroyed) return;

    shield.health -= amount;
    shield.health = Math.max(shield.health, 0);

    if (shield.health <= 0) {
      shield.isDestroyed = true;
      shield.destroyTimer = 0;
    }
  };

  // ✅ FLASH FUNCTION (now in correct place)
  shield.flash = () => {
    if (!shield.material) return;
    shield.material.emissive.set(0xff0000);
    shield.material.emissiveIntensity = 3.0;
    shield.hitFlashTimer = 0.15;
  };

  shield.update = (deltaSeconds) => {
    // 🔴 NORMAL HIT FLASH
    if (!shield.isDestroyed) {
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
      return;
    }

    // 💀 DESTRUCTION SEQUENCE
    shield.destroyTimer += deltaSeconds;

    const t = shield.destroyTimer;

    // 0.0s – flash red
    shield.material.emissive.set(0xff0000);

    // 0.0 → 0.5s glow intensifies
    if (t < 0.5) {
      shield.material.emissiveIntensity = THREE.MathUtils.lerp(1, 4, t / 0.5);
    }

    if (t > 0.5) {
      const progress = THREE.MathUtils.clamp((t - 0.5) / 0.8, 0, 1);

      // Shrink
      const scale = THREE.MathUtils.lerp(1, 0.05, progress);
      shield.object.scale.set(scale, scale, scale);

      // Fade out opacity smoothly
      shield.material.opacity = THREE.MathUtils.lerp(0.3, 0, progress);
    }

    // 1.3s → fully gone
    if (t >= 1.3) {
      shield.object.visible = false;
    }
  };

  return shield;
}
