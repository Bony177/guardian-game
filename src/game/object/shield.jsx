import * as THREE from "three";

export function createShield() {
  const shield = {
    health: 100,
    maxHealth: 100,
    object: new THREE.Group(),
  };

  // Geometry: sphere
  const geometry = new THREE.SphereGeometry(12, 64, 64);

  // Material: energy shield
  const material = new THREE.MeshStandardMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.25,
    emissive: 0x00aaff,
    emissiveIntensity: 0.6,
    roughness: 0.2,
    metalness: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const sphere = new THREE.Mesh(geometry, material);

  shield.object.add(sphere);

  // Utility
  shield.show = () => (shield.object.visible = true);
  shield.hide = () => (shield.object.visible = false);

  shield.takeDamage = (amount) => {
    shield.health -= amount;
    shield.health = Math.max(shield.health, 0);
  };

  return shield;
}
