function Header({
  setActiveOverlay,
  startGame,
  playHoverSound,
  playClickSound,
}) {
  return (
    <div className="header">
      <div className="nav-left">
        <button
          onMouseEnter={playHoverSound}
          onClick={() => {
            playClickSound();
            setActiveOverlay("home");
          }}
        >
          HOME
        </button>

        <button
          onMouseEnter={playHoverSound}
          onClick={() => {
            playClickSound();
            setActiveOverlay("updates");
          }}
        >
          UPDATES
        </button>

        <button
          onMouseEnter={playHoverSound}
          onClick={() => {
            playClickSound();
            setActiveOverlay("about");
          }}
        >
          ABOUT
        </button>

        <button
          onMouseEnter={playHoverSound}
          onClick={() => {
            playClickSound();
            setActiveOverlay("contact");
          }}
        >
          CONTACT
        </button>
      </div>

      <button
        className="play-now"
        onMouseEnter={playHoverSound}
        onClick={() => {
          playClickSound();
          startGame();
        }}
      >
        PLAY NOW
      </button>
    </div>
  );
}

export default Header;
