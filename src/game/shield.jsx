import * as THREE from "three";

const glowTexture = (() => {
  if (typeof document === "undefined") return null;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const gradient = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    0,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(180,235,255,0.92)");
  gradient.addColorStop(0.65, "rgba(92,182,255,0.35)");
  gradient.addColorStop(1, "rgba(25,78,138,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
})();

function randomDomePoint(radius) {
  const theta = THREE.MathUtils.randFloat(0.08, Math.PI / 2);
  const phi = THREE.MathUtils.randFloat(0, Math.PI * 2);
  const sinTheta = Math.sin(theta);
  const x = radius * sinTheta * Math.cos(phi);
  const y = radius * Math.cos(theta);
  const z = radius * sinTheta * Math.sin(phi);
  return new THREE.Vector3(x, y, z);
}

function clampToDome(point, radius, shellScale = 1.01) {
  return point.normalize().multiplyScalar(radius * shellScale);
}

function randomTangentVector(normal) {
  const tangent = new THREE.Vector3(
    THREE.MathUtils.randFloatSpread(1),
    THREE.MathUtils.randFloatSpread(1),
    THREE.MathUtils.randFloatSpread(1),
  );
  const dot = tangent.dot(normal);
  tangent.sub(normal.clone().multiplyScalar(dot));
  if (tangent.lengthSq() < 1e-6) {
    tangent.set(-normal.z, 0, normal.x);
  }
  return tangent.normalize();
}

function fractalSubdivideOnDome(points, radius, iterations, roughness) {
  let result = points.map((p) => p.clone().normalize());
  let currentRoughness = roughness;

  for (let i = 0; i < iterations; i += 1) {
    const next = [result[0].clone()];
    for (let j = 0; j < result.length - 1; j += 1) {
      const p0 = result[j];
      const p1 = result[j + 1];
      const mid = new THREE.Vector3().addVectors(p0, p1).normalize();
      const tangent = randomTangentVector(mid);
      const chord = p0.distanceTo(p1);
      const displacement = chord * currentRoughness * THREE.MathUtils.randFloat(0.8, 1.6);
      mid.addScaledVector(tangent, displacement).normalize();
      next.push(mid, p1.clone());
    }
    result = next;
    currentRoughness *= 0.68;
  }

  return result.map((p) => clampToDome(p, radius));
}

function createBoltPoints(radius) {
  const start = randomDomePoint(radius).normalize();
  const end = randomDomePoint(radius).normalize();
  const iterations = THREE.MathUtils.randInt(4, 6);
  const roughness = THREE.MathUtils.randFloat(0.28, 0.55);
  return fractalSubdivideOnDome([start, end], radius, iterations, roughness);
}

function createSegmentedPath(points) {
  const path = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i += 1) {
    path.add(new THREE.LineCurve3(points[i], points[i + 1]));
  }
  return path;
}

function createBoltGeometry(radius) {
  const points = createBoltPoints(radius);
  const curve = createSegmentedPath(points);
  const tubularSegments = Math.max(28, (points.length - 1) * 3);
  const baseThickness = THREE.MathUtils.randFloat(0.04, 0.09);
  const glowAnchors = [points[Math.floor(points.length * 0.5)].clone()];

  const haloGeometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    baseThickness * 2.1,
    10,
    false,
  );
  const coreGeometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    baseThickness * 0.8,
    8,
    false,
  );

  const branchGeometries = [];
  const branchCount = THREE.MathUtils.randInt(1, 3);
  for (let b = 0; b < branchCount; b += 1) {
    if (points.length < 5) break;
    const startIndex = THREE.MathUtils.randInt(2, points.length - 3);
    const start = points[startIndex].clone().normalize();
    const forward = points[startIndex + 1]
      .clone()
      .normalize()
      .sub(points[startIndex - 1].clone().normalize())
      .normalize();
    const tangent = randomTangentVector(start);
    const mix = THREE.MathUtils.randFloat(0.2, 0.5);
    const branchDir = forward.lerp(tangent, mix).normalize();
    const branchLength = THREE.MathUtils.randFloat(0.18, 0.35);
    const end = start.clone().addScaledVector(branchDir, branchLength).normalize();
    const branchPoints = fractalSubdivideOnDome(
      [start, end],
      radius,
      THREE.MathUtils.randInt(2, 4),
      THREE.MathUtils.randFloat(0.28, 0.55),
    );

    const branchCurve = createSegmentedPath(branchPoints);
    const branchSegments = Math.max(14, (branchPoints.length - 1) * 3);
    const branchThickness = baseThickness * THREE.MathUtils.randFloat(0.45, 0.75);
    glowAnchors.push(branchPoints[Math.floor(branchPoints.length * 0.45)].clone());

    branchGeometries.push({
      haloGeometry: new THREE.TubeGeometry(
        branchCurve,
        branchSegments,
        branchThickness * 1.9,
        8,
        false,
      ),
      coreGeometry: new THREE.TubeGeometry(
        branchCurve,
        branchSegments,
        branchThickness * 0.72,
        6,
        false,
      ),
    });
  }

  return { haloGeometry, coreGeometry, branchGeometries, glowAnchors };
}

function createSurfaceGlow(anchor, radius) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture,
    color: new THREE.Color(0x83d4ff),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(material);
  const position = clampToDome(anchor.clone(), radius, 1.008);
  glow.position.copy(position);
  const size = THREE.MathUtils.randFloat(1.25, 2.3);
  glow.scale.set(size, size, 1);
  glow.renderOrder = 1;
  return glow;
}

function clearBranchesAndGlows(bolt) {
  if (Array.isArray(bolt.userData.branchMeshes)) {
    for (const branch of bolt.userData.branchMeshes) {
      if (branch?.halo?.geometry) branch.halo.geometry.dispose();
      if (branch?.core?.geometry) branch.core.geometry.dispose();
      if (branch?.halo?.material) branch.halo.material.dispose();
      if (branch?.core?.material) branch.core.material.dispose();
      if (branch?.halo?.parent) branch.halo.parent.remove(branch.halo);
      if (branch?.core?.parent) branch.core.parent.remove(branch.core);
    }
  }
  bolt.userData.branchMeshes = [];
  bolt.userData.branchData = [];

  if (Array.isArray(bolt.userData.glowSprites)) {
    for (const glow of bolt.userData.glowSprites) {
      if (glow?.material) glow.material.dispose();
      if (glow?.parent) glow.parent.remove(glow);
    }
  }
  bolt.userData.glowSprites = [];
  bolt.userData.glowData = [];
}

function createBoltLine(radius) {
  const { haloGeometry, coreGeometry, branchGeometries, glowAnchors } = createBoltGeometry(radius);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x71c7ff),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });

  const coreMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xc7efff),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });

  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  halo.renderOrder = 1;
  core.renderOrder = 1;

  const bolt = new THREE.Group();
  bolt.visible = false;
  bolt.renderOrder = 1;
  bolt.add(halo);
  bolt.add(core);
  bolt.userData.branchMeshes = [];
  bolt.userData.branchData = [];
  bolt.userData.glowSprites = [];
  bolt.userData.glowData = [];

  bolt.userData.life = 0;
  bolt.userData.maxLife = 0;
  bolt.userData.cooldown = THREE.MathUtils.randFloat(0.35, 0.9);
  bolt.userData.halo = halo;
  bolt.userData.core = core;
  bolt.userData.haloMaterial = haloMaterial;
  bolt.userData.coreMaterial = coreMaterial;
  bolt.userData.haloPeak = 0.2;
  bolt.userData.corePeak = 0.45;
  bolt.userData.jitterTimer = 0;
  bolt.userData.nextJitter = THREE.MathUtils.randFloat(0.16, 0.34);

  for (const branchGeometry of branchGeometries) {
    const branchHaloMaterial = haloMaterial.clone();
    const branchCoreMaterial = coreMaterial.clone();
    const branchHalo = new THREE.Mesh(branchGeometry.haloGeometry, branchHaloMaterial);
    const branchCore = new THREE.Mesh(branchGeometry.coreGeometry, branchCoreMaterial);
    branchHalo.renderOrder = 1;
    branchCore.renderOrder = 1;
    bolt.add(branchHalo);
    bolt.add(branchCore);
    bolt.userData.branchMeshes.push({ halo: branchHalo, core: branchCore });
    bolt.userData.branchData.push({
      haloMaterial: branchHaloMaterial,
      coreMaterial: branchCoreMaterial,
      haloPeak: 0.14,
      corePeak: 0.28,
    });
  }

  for (const anchor of glowAnchors) {
    const glow = createSurfaceGlow(anchor, radius);
    bolt.add(glow);
    bolt.userData.glowSprites.push(glow);
    bolt.userData.glowData.push({
      material: glow.material,
      peak: 0.22,
    });
  }
  return bolt;
}

function respawnBolt(bolt, radius) {
  const { haloGeometry, coreGeometry, branchGeometries, glowAnchors } = createBoltGeometry(radius);
  const halo = bolt.userData.halo;
  const core = bolt.userData.core;
  const haloMaterial = bolt.userData.haloMaterial;
  const coreMaterial = bolt.userData.coreMaterial;

  if (halo?.geometry) halo.geometry.dispose();
  if (core?.geometry) core.geometry.dispose();
  if (halo) halo.geometry = haloGeometry;
  if (core) core.geometry = coreGeometry;

  clearBranchesAndGlows(bolt);

  bolt.visible = true;
  bolt.userData.maxLife = THREE.MathUtils.randFloat(0.34, 0.8);
  bolt.userData.life = bolt.userData.maxLife;
  bolt.userData.haloPeak = THREE.MathUtils.randFloat(0.12, 0.24);
  bolt.userData.corePeak = THREE.MathUtils.randFloat(0.3, 0.58);
  bolt.userData.jitterTimer = 0;
  bolt.userData.nextJitter = THREE.MathUtils.randFloat(0.18, 0.38);
  if (haloMaterial) haloMaterial.opacity = bolt.userData.haloPeak;
  if (coreMaterial) coreMaterial.opacity = bolt.userData.corePeak;

  const hue = THREE.MathUtils.randFloat(0.54, 0.58);
  const sat = THREE.MathUtils.randFloat(0.62, 0.95);
  if (haloMaterial) {
    const haloLight = THREE.MathUtils.randFloat(0.54, 0.7);
    haloMaterial.color.setHSL(hue, sat, haloLight);
  }
  if (coreMaterial) {
    const coreLight = THREE.MathUtils.randFloat(0.85, 0.96);
    coreMaterial.color.setHSL(hue, THREE.MathUtils.clamp(sat - 0.26, 0, 1), coreLight);
  }

  for (const branchGeometry of branchGeometries) {
    const branchHaloMaterial = haloMaterial ? haloMaterial.clone() : null;
    const branchCoreMaterial = coreMaterial ? coreMaterial.clone() : null;
    const branchHalo = new THREE.Mesh(branchGeometry.haloGeometry, branchHaloMaterial);
    const branchCore = new THREE.Mesh(branchGeometry.coreGeometry, branchCoreMaterial);
    branchHalo.renderOrder = 1;
    branchCore.renderOrder = 1;
    bolt.add(branchHalo);
    bolt.add(branchCore);

    const haloPeak = bolt.userData.haloPeak * THREE.MathUtils.randFloat(0.22, 0.45);
    const corePeak = bolt.userData.corePeak * THREE.MathUtils.randFloat(0.24, 0.5);
    if (branchHaloMaterial) branchHaloMaterial.opacity = haloPeak;
    if (branchCoreMaterial) branchCoreMaterial.opacity = corePeak;

    bolt.userData.branchMeshes.push({ halo: branchHalo, core: branchCore });
    bolt.userData.branchData.push({
      haloMaterial: branchHaloMaterial,
      coreMaterial: branchCoreMaterial,
      haloPeak,
      corePeak,
    });
  }

  for (const anchor of glowAnchors) {
    const glow = createSurfaceGlow(anchor, radius);
    const glowMaterial = glow.material;
    const glowPeak = bolt.userData.corePeak * THREE.MathUtils.randFloat(0.35, 0.65);
    if (haloMaterial && glowMaterial) glowMaterial.color.copy(haloMaterial.color).offsetHSL(0, 0, 0.1);
    if (glowMaterial) glowMaterial.opacity = glowPeak;
    bolt.add(glow);
    bolt.userData.glowSprites.push(glow);
    bolt.userData.glowData.push({
      material: glowMaterial,
      peak: glowPeak,
    });
  }
}

export function createShield() {
  const radius = 12;
  const shield = {
    health: 100,
    maxHealth: 100,
    object: new THREE.Group(),
    hitFlashTimer: 0,
    baseEmissive: 0.9,
  };

  shield.isDestroyed = false;
  shield.destroyTimer = 0;
  shield.originalScale = 1;
  shield.shakeIntensity = 0;

  const geometry = new THREE.SphereGeometry(
    radius,
    96,
    48,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );

  const coreMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x4f8fff,
    transparent: true,
    opacity: 0.2,
    emissive: 0x4f9dff,
    emissiveIntensity: 0.95,
    roughness: 0.06,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.32,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });

  const coreDome = new THREE.Mesh(geometry, coreMaterial);

  const boltGroup = new THREE.Group();
  const boltCount = 14;
  const bolts = [];
  for (let i = 0; i < boltCount; i += 1) {
    const bolt = createBoltLine(radius);
    bolts.push(bolt);
    boltGroup.add(bolt);
  }

  coreDome.renderOrder = 1;
  boltGroup.renderOrder = 1;
  shield.object.renderOrder = 1;

  shield.material = coreMaterial;
  shield.bolts = bolts;
  shield.radius = radius;

  shield.object.add(coreDome);
  shield.object.add(boltGroup);

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

  shield.flash = () => {
    if (!shield.material) return;
    shield.material.emissive.set(0xff0000);
    shield.material.emissiveIntensity = 3.0;

    if (shield.bolts?.length) {
      for (let i = 0; i < 5; i += 1) {
        const bolt = shield.bolts[Math.floor(Math.random() * shield.bolts.length)];
        if (bolt) respawnBolt(bolt, shield.radius);
      }
    }

    shield.hitFlashTimer = 0.15;
  };

  shield.update = (deltaSeconds) => {
    if (!shield.isDestroyed) {
      if (shield.bolts?.length) {
        for (const bolt of shield.bolts) {
          if (bolt.visible) {
            bolt.userData.life -= deltaSeconds;
            const lifeRatio = bolt.userData.life / bolt.userData.maxLife;
            const flicker = THREE.MathUtils.randFloat(0.78, 1.25);
            const haloMaterial = bolt.userData.haloMaterial;
            const coreMaterial = bolt.userData.coreMaterial;
            const decay = Math.max(0, lifeRatio);
            if (haloMaterial) {
              haloMaterial.opacity = decay * bolt.userData.haloPeak * (0.95 + flicker * 0.42);
            }
            if (coreMaterial) {
              coreMaterial.opacity = decay * bolt.userData.corePeak * (0.92 + flicker * 0.5);
            }
            if (Array.isArray(bolt.userData.branchData)) {
              for (const branch of bolt.userData.branchData) {
                if (branch.haloMaterial) {
                  branch.haloMaterial.opacity =
                    decay * branch.haloPeak * (0.86 + flicker * 0.36);
                }
                if (branch.coreMaterial) {
                  branch.coreMaterial.opacity =
                    decay * branch.corePeak * (0.88 + flicker * 0.42);
                }
              }
            }
            if (Array.isArray(bolt.userData.glowData)) {
              for (const glow of bolt.userData.glowData) {
                if (glow.material) {
                  glow.material.opacity = decay * glow.peak * (0.9 + flicker * 0.48);
                }
              }
            }

            bolt.userData.jitterTimer += deltaSeconds;
            if (bolt.userData.jitterTimer >= bolt.userData.nextJitter) {
              const remainRatio = THREE.MathUtils.clamp(
                bolt.userData.life / Math.max(bolt.userData.maxLife, 0.0001),
                0,
                1,
              );
              const prevLife = bolt.userData.life;
              const prevMaxLife = bolt.userData.maxLife;
              const prevHaloPeak = bolt.userData.haloPeak;
              const prevCorePeak = bolt.userData.corePeak;
              respawnBolt(bolt, shield.radius);
              bolt.userData.maxLife = prevMaxLife;
              bolt.userData.life = prevLife;
              bolt.userData.haloPeak = prevHaloPeak;
              bolt.userData.corePeak = prevCorePeak;
              bolt.userData.jitterTimer = 0;
              bolt.userData.nextJitter = THREE.MathUtils.randFloat(0.18, 0.38);
              const haloMat = bolt.userData.haloMaterial;
              const coreMat = bolt.userData.coreMaterial;
              if (haloMat) haloMat.opacity = prevHaloPeak * remainRatio;
              if (coreMat) coreMat.opacity = prevCorePeak * remainRatio;
              if (Array.isArray(bolt.userData.glowData)) {
                for (const glow of bolt.userData.glowData) {
                  if (glow.material) glow.material.opacity = glow.peak * remainRatio;
                }
              }
            }

            if (bolt.userData.life <= 0) {
              bolt.visible = false;
              bolt.userData.cooldown = THREE.MathUtils.randFloat(0.3, 0.9);
            }
          } else {
            bolt.userData.cooldown -= deltaSeconds;
            if (bolt.userData.cooldown <= 0) {
              const shouldSpawn = Math.random() < 0.2;
              if (shouldSpawn) respawnBolt(bolt, shield.radius);
              else bolt.userData.cooldown = THREE.MathUtils.randFloat(0.24, 0.7);
            }
          }
        }
      }

      if (shield.hitFlashTimer > 0) {
        shield.hitFlashTimer -= deltaSeconds;
      } else {
        shield.material.emissive.set(0x4f9dff);
        shield.material.emissiveIntensity = THREE.MathUtils.lerp(
          shield.material.emissiveIntensity,
          shield.baseEmissive,
          0.14,
        );
      }
      return;
    }

    shield.destroyTimer += deltaSeconds;
    const t = shield.destroyTimer;

    shield.material.emissive.set(0xff0000);

    if (t < 0.5) {
      shield.material.emissiveIntensity = THREE.MathUtils.lerp(1, 4, t / 0.5);
    }

    if (t > 0.5) {
      const progress = THREE.MathUtils.clamp((t - 0.5) / 0.8, 0, 1);
      const scale = THREE.MathUtils.lerp(1, 0.05, progress);
      shield.object.scale.set(scale, scale, scale);

      shield.material.opacity = THREE.MathUtils.lerp(0.2, 0, progress);

      if (shield.bolts?.length) {
        const boltFade = THREE.MathUtils.lerp(1, 0, progress);
        for (const bolt of shield.bolts) {
          const haloMaterial = bolt.userData.haloMaterial;
          const coreMaterial = bolt.userData.coreMaterial;
          if (haloMaterial) haloMaterial.opacity *= boltFade;
          if (coreMaterial) coreMaterial.opacity *= boltFade;
          if (Array.isArray(bolt.userData.branchData)) {
            for (const branch of bolt.userData.branchData) {
              if (branch.haloMaterial) branch.haloMaterial.opacity *= boltFade;
              if (branch.coreMaterial) branch.coreMaterial.opacity *= boltFade;
            }
          }
          if (Array.isArray(bolt.userData.glowData)) {
            for (const glow of bolt.userData.glowData) {
              if (glow.material) glow.material.opacity *= boltFade;
            }
          }
          let finalOpacity = Math.max(
            haloMaterial?.opacity ?? 0,
            coreMaterial?.opacity ?? 0,
          );
          if (Array.isArray(bolt.userData.branchData)) {
            for (const branch of bolt.userData.branchData) {
              finalOpacity = Math.max(
                finalOpacity,
                branch.haloMaterial?.opacity ?? 0,
                branch.coreMaterial?.opacity ?? 0,
              );
            }
          }
          if (Array.isArray(bolt.userData.glowData)) {
            for (const glow of bolt.userData.glowData) {
              finalOpacity = Math.max(finalOpacity, glow.material?.opacity ?? 0);
            }
          }
          bolt.visible = finalOpacity > 0.01;
        }
      }
    }

    if (t >= 1.3) {
      shield.object.visible = false;
    }
  };

  return shield;
}
