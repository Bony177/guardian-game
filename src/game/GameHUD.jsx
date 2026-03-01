import { useEffect, useRef } from "react";

function GameHUD({ score }) {
  const coinAudioRef = useRef(null);
  const previousScoreRef = useRef(score);

  useEffect(() => {
    const audio = new Audio("/audio/coin.mp3");
    audio.preload = "auto";
    audio.volume = 1.0;

    // 🔓 Unlock audio on first interaction
    const unlockAudio = () => {
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {});

      window.removeEventListener("dblclick", unlockAudio);
    };

    window.addEventListener("dblclick", unlockAudio);

    coinAudioRef.current = audio;

    return () => {
      window.removeEventListener("dblclick", unlockAudio);
    };
  }, []);

  useEffect(() => {
    if (score > previousScoreRef.current) {
      if (coinAudioRef.current) {
        coinAudioRef.current.currentTime = 0;
        coinAudioRef.current.play().catch((err) => {
          console.warn("Coin blocked:", err);
        });
      }
    }

    previousScoreRef.current = score;
  }, [score]);

  return (
    <>
      <div className="top-hud">
        <div className="hud-box vault-box">
          <div className="vault-health">
            VAULT HEALTH
            <div className="vault-bar">
              <div className="vault-fill power-fill-green"></div>
            </div>
            <span>78%</span>
          </div>
        </div>

        <div className="hud-box sector-box">SECTOR 5 – NIGHT ASSAULT</div>

        <div className="hud-box score-box">
          <div className="score-panel">
            SCORE
            <span>{score}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export default GameHUD;
