import { Canvas, useFrame } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  ToneMapping,
} from "@react-three/postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, Vector3 } from "three";
import { LightningStrike } from "three-stdlib";

const LIGHTNING_MEDIA_SOURCES = ["/audio/light.mp3"];
// Higher number = more frequent lightning strikes.
const LIGHTNING_STRIKE_FREQUENCY = 3;
// Increase these to make each lightning strike stay visible longer.
const LIGHTNING_STRIKE_MIN_DURATION_MS = 1500;
const LIGHTNING_STRIKE_MAX_DURATION_MS = 2200;

function scaleStrikeDelay(delayMs) {
  const frequency = Math.max(LIGHTNING_STRIKE_FREQUENCY, 0.1);
  return delayMs / frequency;
}

function getStrikeDuration() {
  const minDuration = Math.max(LIGHTNING_STRIKE_MIN_DURATION_MS, 0);
  const maxDuration = Math.max(LIGHTNING_STRIKE_MAX_DURATION_MS, minDuration);
  return minDuration + Math.random() * (maxDuration - minDuration);
}

async function resolveLightningMediaSource(signal) {
  for (const source of LIGHTNING_MEDIA_SOURCES) {
    try {
      const response = await fetch(source, { method: "HEAD", signal });
      if (response.ok) return source;
    } catch {
      // Try next source.
    }
  }
  return null;
}

function LightningRay({ strikeId }) {
  const baseSource = useMemo(() => {
    // Pin strike origin near the top-right corner (off-screen start).
    const sourceX = 62 + Math.random() * 6;
    return new Vector3(sourceX, 80 + Math.random() * 8, -32);
  }, [strikeId]);

  const baseDest = useMemo(() => {
    const destX = baseSource.x + (-18 + Math.random() * 36);
    const destY = -8 - Math.random() * 8;
    return new Vector3(destX, destY, -28);
  }, [baseSource]);

  const rayParams = useMemo(
    () => ({
      sourceOffset: baseSource.clone(),
      destOffset: baseDest.clone(),
      radius0: 0.42,
      radius1: 0.34,
      minRadius: 0.8,
      maxRadius: 1.7,
      maxIterations: 6,
      isEternal: true,
      timeScale: 1.1,
      propagationTimeFactor: 0.12,
      vanishingTimeFactor: 0.92,
      roughness: 0.84,
      straightness: 0.64,
    }),
    [baseDest, baseSource],
  );

  const geometry = useMemo(() => new LightningStrike(rayParams), [rayParams]);

  useEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    rayParams.destOffset.x = baseDest.x + Math.sin(t * 7.4 + strikeId) * 1.4;
    rayParams.destOffset.y = baseDest.y + Math.cos(t * 9.2 + strikeId) * 0.8;
    rayParams.sourceOffset.x =
      baseSource.x + Math.sin(t * 4.6 + strikeId) * 0.42;

    geometry.update(t);
  });

  return (
    <mesh frustumCulled={false}>
      <primitive object={geometry} attach="geometry" />
      <meshBasicMaterial
        color="#f7fbff"
        transparent
        opacity={1}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

export default function SkyLightning({ canPlaySound = false }) {
  const [active, setActive] = useState(false);
  const [strikeId, setStrikeId] = useState(0);
  const strikeMediaRef = useRef(null);
  const canPlaySoundRef = useRef(canPlaySound);

  useEffect(() => {
    canPlaySoundRef.current = canPlaySound;
  }, [canPlaySound]);

  useEffect(() => {
    let disposed = false;
    const abortController = new AbortController();

    (async () => {
      const source = await resolveLightningMediaSource(abortController.signal);
      if (disposed || !source) return;

      const media = new Audio(source);
      media.preload = "auto";
      media.volume = 0.5;
      strikeMediaRef.current = media;
    })();

    return () => {
      disposed = true;
      abortController.abort();
      if (strikeMediaRef.current) {
        strikeMediaRef.current.pause();
        strikeMediaRef.current.currentTime = 0;
      }
      strikeMediaRef.current = null;
    };
  }, []);

  const playStrikeMedia = () => {
    if (!canPlaySoundRef.current) return;
    const media = strikeMediaRef.current;
    if (!media) return;

    media.currentTime = 0;
    void media.play().catch((error) => {
      console.warn("Unable to play lightning media", error);
    });
  };

  useEffect(() => {
    let launchTimer = 0;
    let stopTimer = 0;
    let cancelled = false;

    const queueNext = (initial = false) => {
      const nextDelay = initial
        ? scaleStrikeDelay(900)
        : scaleStrikeDelay(20000 + Math.random() * 10000);
      launchTimer = window.setTimeout(() => {
        if (cancelled) return;

        setStrikeId((prev) => prev + 1);
        setActive(true);
        playStrikeMedia();

        const strikeDuration = getStrikeDuration();
        stopTimer = window.setTimeout(() => {
          if (cancelled) return;
          setActive(false);
          queueNext();
        }, strikeDuration);
      }, nextDelay);
    };

    queueNext(true);

    return () => {
      cancelled = true;
      window.clearTimeout(launchTimer);
      window.clearTimeout(stopTimer);
    };
  }, []);

  if (!active) return null;

  return (
    <Canvas
      camera={{ position: [0, 10, 80], fov: 50 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <fog attach="fog" args={["#020817", 65, 130]} />
      <ambientLight intensity={0.25} />
      <pointLight position={[20, 30, 12]} intensity={0.65} />

      <LightningRay strikeId={strikeId} />

      <EffectComposer>
        <Bloom intensity={2.2} luminanceThreshold={0.32} mipmapBlur />
        <ToneMapping />
      </EffectComposer>
    </Canvas>
  );
}
