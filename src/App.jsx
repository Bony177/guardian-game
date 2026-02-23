import { useState } from "react";
import Scene from "./game/scene";
import Landing from "./game/landing";

function App() {
  const [gameStarted, setGameStarted] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState(null);

  const startGame = () => {
    setGameStarted(true);
    setActiveOverlay(null);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      {!gameStarted ? (
        <Landing setActiveOverlay={setActiveOverlay} startGame={startGame} />
      ) : (
        <Scene />
      )}
    </div>
  );
}

export default App;
