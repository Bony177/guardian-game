import Header from "./Header";
import "./style.css";

function Landing({ setActiveOverlay, startGame }) {
  return (
    <div className="landing">
      <Header setActiveOverlay={setActiveOverlay} />

      <div className="hero">
        <h1 className="title">SIGNAL BREACH</h1>
        <p className="subtitle">THE SIGNAL BREACHED SOME SHIT BLAH BLAH</p>

        <div className="hero-buttons">
          <button
            className="primary-btn"
            onClick={() => setActiveOverlay("missions")}
          >
            START MISSION
          </button>

          <button className="secondary-btn" onClick={startGame}>
            QUICK PLAY
          </button>
        </div>
      </div>

      <div className="bottom-panels">
        <div className="card" onClick={() => setActiveOverlay("missions")}>
          MISSIONS
        </div>

        <div className="card" onClick={() => setActiveOverlay("armory")}>
          ARMORY
        </div>

        <div className="card" onClick={() => setActiveOverlay("hangar")}>
          SHIP HANGAR
        </div>
      </div>
    </div>
  );
}

export default Landing;
