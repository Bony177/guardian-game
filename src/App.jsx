import { useState } from "react";
import Scene from "./game/scene";
import Landing from "./game/landing";

function App() {
  const [inGame, setInGame] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState(null);
  const [currentTab, setCurrentTab] = useState("MISSIONS");

  const startGame = () => {
    setInGame(true);
    setActiveOverlay(null);
  };

  const closeOverlay = () => {
    setActiveOverlay(null);
  };

  const handleTabChange = (direction) => {
    const tabs = ["MISSIONS", "ARMORY", "SHIP HANGAR"];
    const currentIndex = tabs.indexOf(currentTab);
    let newIndex;
    if (direction === "next") {
      newIndex = (currentIndex + 1) % tabs.length;
    } else {
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }
    setCurrentTab(tabs[newIndex]);
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "black" }}>
      {!inGame ? (
        <Landing
          activeOverlay={activeOverlay}
          setActiveOverlay={setActiveOverlay}
          closeOverlay={closeOverlay}
          startGame={startGame}
          currentTab={currentTab}
          handleTabChange={handleTabChange}
        />
      ) : (
        <Scene />
      )}
    </div>
  );
}

export default App;
