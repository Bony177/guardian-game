const overlayOrder = ["missions", "armory", "hangar"];

function Overlay({ type, closeOverlay, setActiveOverlay }) {
  const isHeaderOverlay =
    type === "home" ||
    type === "news" ||
    type === "factions" ||
    type === "community";

  const currentIndex = overlayOrder.indexOf(type);

  const goNext = () => {
    if (currentIndex !== -1 && currentIndex < overlayOrder.length - 1) {
      setActiveOverlay(overlayOrder[currentIndex + 1]);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setActiveOverlay(overlayOrder[currentIndex - 1]);
    }
  };

  return (
    <div className="overlay">
      {!isHeaderOverlay && (
        <button className="close-btn" onClick={closeOverlay}>
          ✕
        </button>
      )}

      {currentIndex !== -1 && currentIndex > 0 && (
        <button className="arrow left" onClick={goPrev}>
          ◀
        </button>
      )}

      {currentIndex !== -1 && currentIndex < overlayOrder.length - 1 && (
        <button className="arrow right" onClick={goNext}>
          ▶
        </button>
      )}

      <div className="overlay-content">
        <h2>{type.toUpperCase()}</h2>
        <p>This is the {type} panel content.</p>
      </div>
    </div>
  );
}

export default Overlay;
