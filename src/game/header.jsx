function Header({ setActiveOverlay, startGame }) {
  return (
    <div className="header">
      <div className="nav-left">
        <button onClick={() => setActiveOverlay("home")}>HOME</button>
        <button onClick={() => setActiveOverlay("news")}>NEWS</button>
        <button onClick={() => setActiveOverlay("factions")}>FACTIONS</button>
        <button onClick={() => setActiveOverlay("community")}>COMMUNITY</button>
      </div>

      <button className="play-now" onClick={startGame}>
        PLAY NOW
      </button>
    </div>
  );
}

export default Header;
