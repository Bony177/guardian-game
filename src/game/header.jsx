function Header({
  setActiveOverlay,
  startGame,
  playHeaderHoverSound,
  playHeaderClickSound,
}) {
  return (
    <div className="header">
      <div className="nav-left">
        <button
          onMouseEnter={playHeaderHoverSound}
          onClick={() => {
            playHeaderClickSound();
            setActiveOverlay("home");
          }}
        >
          HOME
        </button>

        <button
          onMouseEnter={playHeaderHoverSound}
          onClick={() => {
            playHeaderClickSound();
            setActiveOverlay("updates");
          }}
        >
          UPDATES
        </button>

        <button
          onMouseEnter={playHeaderHoverSound}
          onClick={() => {
            playHeaderClickSound();
            setActiveOverlay("about");
          }}
        >
          ABOUT
        </button>

        <button
          onMouseEnter={playHeaderHoverSound}
          onClick={() => {
            playHeaderClickSound();
            setActiveOverlay("contact");
          }}
        >
          CONTACT
        </button>
      </div>

      <button
        className="play-now"
        onMouseEnter={playHeaderHoverSound}
        onClick={() => {
          playHeaderClickSound();
          startGame();
        }}
      >
        PLAY NOW
      </button>
    </div>
  );
}

export default Header;
