import "./overlay.css";

const POPUP_OVERLAYS = ["home", "news", "factions", "community"];
const FULLSCREEN_OVERLAYS = ["missions", "armory", "hangar"];

const OVERLAY_CONTENT = {
  home: {
    title: "HOME",
    content: "Welcome back to the command center.",
  },
  news: {
    title: "NEWS",
    content: "Check back for the latest updates and announcements.",
  },
  factions: {
    title: "FACTIONS",
    content: "Choose your faction and rise through the ranks.",
  },
  community: {
    title: "COMMUNITY",
    content: "Join our community and connect with other players.",
  },
  missions: {
    title: "MISSIONS",
    content: "Select your mission and prepare for departure.",
  },
  armory: {
    title: "ARMORY",
    content: "Upgrade your weapons and equipment.",
  },
  hangar: {
    title: "SHIP HANGAR",
    content: "Manage and customize your fleet.",
  },
};

const TAB_ORDER = ["MISSIONS", "ARMORY", "SHIP HANGAR"];

function Overlay({ activeOverlay, closeOverlay, currentTab, handleTabChange }) {
  if (!activeOverlay) return null;

  // Determine if it's a modal or fullscreen overlay
  const isPopup = POPUP_OVERLAYS.includes(activeOverlay);
  const isFullscreen = FULLSCREEN_OVERLAYS.includes(activeOverlay);

  // Get data from OVERLAY_CONTENT
  const overlayKey = isFullscreen
    ? currentTab.toLowerCase().replace(" ", "-")
    : activeOverlay.toLowerCase();
  const data = OVERLAY_CONTENT[overlayKey] || OVERLAY_CONTENT[activeOverlay];

  if (isPopup) {
    return (
      <div className="overlay-popup">
        <div className="overlay-modal">
          <button className="close-btn" onClick={closeOverlay}>
            ✕
          </button>
          <div className="overlay-content">
            <h2>{data.title}</h2>
            <p>{data.content}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isFullscreen) {
    return (
      <div className="overlay-fullscreen">
        <button className="close-btn" onClick={closeOverlay}>
          ✕
        </button>

        <div className="overlay-content-fullscreen">
          <h1>{data.title}</h1>
          <p>{data.content}</p>
        </div>

        <button
          className="arrow arrow-left"
          onClick={() => handleTabChange("prev")}
        >
          ◀
        </button>

        <button
          className="arrow arrow-right"
          onClick={() => handleTabChange("next")}
        >
          ▶
        </button>

        <div className="overlay-tabs">
          {TAB_ORDER.map((tab) => (
            <div
              key={tab}
              className={`tab-btn ${currentTab === tab ? "active" : ""}`}
            >
              {tab}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export default Overlay;
