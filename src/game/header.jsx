function Header({
  setActiveOverlay,
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

    </div>
  );
}

export default Header;
