function GameHUD() {
  return (
    <>
      <div className="top-hud">
        <div className="hud-box vault-box">
          <div className="vault-health">
            VAULT HEALTH
            <div className="vault-bar">
              <div className="vault-fill power-fill-green" id="powerFill"></div>
            </div>
            <span id="vaultHealthValue">78%</span>
          </div>
        </div>

        <div className="hud-box sector-box">SECTOR 5 – NIGHT ASSAULT</div>

        <div className="hud-box score-box">
          <div className="score-panel">
            SCORE
            <span id="scoreValue">0</span>
          </div>
        </div>
      </div>

      <div className="radar-panel">
        <div className="radar-header">
          <div className="title">THREAT SCAN</div>
          <div className="enemy-count">
            ENEMIES : <span id="enemyNumber">08</span>
          </div>
        </div>

        <div className="shield-status">
          <span className="shield-label">SHIELD</span>
          <div className="shield-track">
            <div className="shield-fill" id="shieldHealthFill"></div>
          </div>
          <span className="shield-value" id="shieldHealthValue">
            100%
          </span>
        </div>

        <div className="radar-body">
          <div className="grid"></div>
          <div className="scan-line"></div>
          <div className="dots" id="dots"></div>
        </div>
      </div>

      <div className="film-grain"></div>
    </>
  );
}

export default GameHUD;
