import "../index.css";

export default function HUD({
  score = 0,
  enemyCount = 0,
  shieldPercent = 100,
  vaultPercent = 100,
  shieldRegenPercent = 0,
  showShieldRegen = false,
  showVaultHud = false,
}) {
  // Determine vault fill color based on level
  let powerFillClass = "power-fill-green";
  if (vaultPercent <= 40) {
    powerFillClass = "power-fill-red";
  } else if (vaultPercent < 70) {
    powerFillClass = "power-fill-yellow";
  }

  // Format score with thousands separator
  const formattedScore = Math.max(0, Math.round(score)).toLocaleString();

  // Format enemy count with zero padding
  const formattedEnemyCount = enemyCount.toString().padStart(2, "0");

  return (
    <>
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

        <div className="hud-box sector-box">SECTOR 5 – NIGHT ASSAULT</div>

        <div className="hud-box score-box">
          <div className="score-panel">
            SCORE
            <span>{formattedScore}</span>
          </div>
        </div>
      </div>

      {/* Radar */}
      <div className="radar-panel">
        <div className="radar-header">
          <div className="title">THREAT SCAN</div>
          <div className="enemy-count">ENEMIES : {formattedEnemyCount}</div>
        </div>

        <div className="shield-status">
          <span className="shield-label">SHIELD</span>
          <div className="shield-track">
            <div
              className="shield-fill"
              style={{
                width: `${shieldPercent}%`,
              }}
            />
          </div>
          <span className="shield-value">{shieldPercent}%</span>
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
            <span>⚠ RANGE</span>
            <div className="range-bars">
              <div></div>
              <div></div>
              <div></div>
            </div>
          </div>
        </div>
      </div>

      {showShieldRegen || showVaultHud ? (
        <div className="bottom-right-hud">
          {showVaultHud ? (
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
          ) : null}

          {showShieldRegen ? (
            <div className="shield-regen-hud">
              <div className="shield-regen-title">SHIELD REGENERATION</div>
              <div className="shield-regen-track">
                <div
                  className="shield-regen-fill"
                  style={{ width: `${shieldRegenPercent}%` }}
                />
              </div>
              <div className="shield-regen-value">{shieldRegenPercent}%</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="film-grain"></div>
    </>
  );
}
