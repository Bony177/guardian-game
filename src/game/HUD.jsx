import "../index.css";
import { useState, useEffect, useRef } from "react";

export default function HUD({
  score = 0,
  killCount = 0,
  enemyCount = 0,
  shieldPercent = 100,
  vaultPercent = 100,
  shieldRegenPercent = 0,
  showShieldRegen = false,
}) {
  // Determine vault fill color based on level
  let powerFillClass = "power-fill-green";
  if (vaultPercent <= 40) {
    powerFillClass = "power-fill-red";
  } else if (vaultPercent < 70) {
    powerFillClass = "power-fill-yellow";
  }
  const graphChars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇"];

  const generateGraph = () => {
    let line = "";
    for (let i = 0; i < 8; i++) {
      line += graphChars[Math.floor(Math.random() * graphChars.length)];
    }
    return line;
  };

  const randomCoord = () => (Math.random() * 4000 - 2000).toFixed(2);

  const [coords, setCoords] = useState({
    x: randomCoord(),
    y: randomCoord(),
    z: randomCoord(),
    drift: Math.random().toFixed(3),
    trajectory: (Math.random() * 90).toFixed(1),
  });

  const [graphLines, setGraphLines] = useState([
    generateGraph(),
    generateGraph(),
    generateGraph(),
  ]);

  const scoreValue = Math.max(0, Math.round(score))
    .toString()
    .padStart(6, "0")
    .slice(-6);
  const killValue = Math.max(0, Math.round(killCount))
    .toString()
    .padStart(3, "0")
    .slice(-3);

  const [scorePulse, setScorePulse] = useState(false);
  const [killPulse, setKillPulse] = useState(false);
  const previousScoreRef = useRef(score);
  const previousKillRef = useRef(killCount);

  // Format enemy count with zero padding
  const formattedEnemyCount = enemyCount.toString().padStart(2, "0");
  const isShieldRegenMode = showShieldRegen;
  const displayedShieldPercent = isShieldRegenMode
    ? shieldRegenPercent
    : shieldPercent;
  useEffect(() => {
    const coordInterval = setInterval(() => {
      setCoords({
        x: randomCoord(),
        y: randomCoord(),
        z: randomCoord(),
        drift: Math.random().toFixed(3),
        trajectory: (Math.random() * 90).toFixed(1),
      });
    }, 500);

    const graphInterval = setInterval(() => {
      setGraphLines([generateGraph(), generateGraph(), generateGraph()]);
    }, 200);

    return () => {
      clearInterval(coordInterval);
      clearInterval(graphInterval);
    };
  }, []);

  useEffect(() => {
    if (score === previousScoreRef.current) {
      return;
    }

    setScorePulse(true);
    const timer = setTimeout(() => setScorePulse(false), 480);
    previousScoreRef.current = score;

    return () => clearTimeout(timer);
  }, [score]);

  useEffect(() => {
    if (killCount === previousKillRef.current) {
      return;
    }

    setKillPulse(true);
    const timer = setTimeout(() => setKillPulse(false), 480);
    previousKillRef.current = killCount;

    return () => clearTimeout(timer);
  }, [killCount]);

  return (
    <>
      <div className="hud-decor-layer" aria-hidden="true">
        <img
          src="/textures/uphud.png"
          alt=""
          className="hud-decor hud-decor-up"
        />
        <img
          src="/textures/centre.png"
          alt=""
          className="hud-decor hud-decor-centre"
        />
        <img
          src="/textures/lowhud.png"
          alt=""
          className="hud-decor hud-decor-low"
        />
      </div>

      {/* TOP HUD */}
      <div className="top-hud">
        <div className="hud-box vault-box">
          <div className="vault-health">
            VAULT HEALTH
            <div className="vault-bar">
              <div
                className={`vault-fill ${powerFillClass}`}
                style={{
                  width: `${vaultPercent}%`,
                  transition: "width 700ms ease, background-color 300ms ease",
                }}
              />
            </div>
            <span>{vaultPercent}%</span>
          </div>
        </div>

        <div className="hud-box sector-box">SECTOR ECLIPSE-7</div>

        <div className="score-box mission-data-readout">
          <div className="mission-row">
            <span className="mission-label">SCORE :</span>
            <span className={`mission-value ${scorePulse ? "is-updated" : ""}`}>
              {scoreValue}
            </span>
          </div>

          <div className="mission-separator" aria-hidden="true" />

          <div className="mission-row">
            <span className="mission-label">KILLS :</span>
            <span
              className={`mission-value mission-value-kill ${
                killPulse ? "is-updated" : ""
              }`}
            >
              {killValue}
            </span>
          </div>
        </div>
      </div>
      {/* Bottom dashboard background */}
      <div className="bottom-dashboard"></div>

      {/* Radar */}
      <div className="radar-panel">
        <div className="radar-header">
          <div className="title">THREAT SCAN</div>
          <div className="enemy-count">ENEMIES : {formattedEnemyCount}</div>
        </div>

        <div className="radar-body">
          <div className="grid"></div>
          <div className="scan-line"></div>
          <div className="dots" id="dots"></div>
        </div>

        <div className="radar-footer">
          <div className="signal">
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar dim"></div>
          </div>

          <div className="range">
            <span></span>
            <div className="range-bars">
              <div></div>
              <div></div>
              <div></div>
            </div>
          </div>
        </div>
      </div>
      {/* SIGNAL + COORD PANEL */}
      <div className="signal-module">
        <div className="signal-graph">
          <div className="signal-title">SIGNAL GRAPH</div>
          <div className="signal-lines">
            {graphLines[0]}
            <br />
            {graphLines[1]}
            <br />
            {graphLines[2]}
          </div>
        </div>

        <div className="coordinate-data">
          <div className="coord-title">COORDINATE DATA</div>

          <div>X : {coords.x}</div>
          <div>Y : {coords.y}</div>
          <div>Z : {coords.z}</div>

          <div className="coord-gap"></div>

          <div>TARGET : LOCKED</div>
          <div>TRAJECTORY : {coords.trajectory}°</div>
          <div>DRIFT : {coords.drift}</div>
        </div>
      </div>
      <div className="bottom-right-hud">
        <div className="vault-status-hud">
          <div className="vault-status-title">VAULT INTEGRITY</div>
          <div className="vault-status-track">
            <div
              className="vault-status-fill"
              style={{ width: `${vaultPercent}%` }}
            />
          </div>
          <div className="vault-status-value">{vaultPercent}%</div>
        </div>

        <div
          className={`shield-status-hud ${
            isShieldRegenMode ? "regen-mode" : "health-mode"
          }`}
        >
          <div className="shield-status-title">
            {isShieldRegenMode ? "SHIELD REGENERATION" : "SHIELD HEALTH"}
          </div>
          <div className="shield-status-track">
            <div
              className="shield-status-fill"
              style={{ width: `${displayedShieldPercent}%` }}
            />
          </div>
          <div className="shield-status-value">{displayedShieldPercent}%</div>
        </div>
      </div>

      <div className="film-grain"></div>
    </>
  );
}
