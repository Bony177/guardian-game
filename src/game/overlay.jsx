import "./overlay.css";
import { useEffect, useState } from "react";
import ShipViewer from "./ShipViewer";

const POPUP_OVERLAYS = ["home", "news", "factions", "community"];
const FULLSCREEN_OVERLAYS = ["missions", "armory", "hangar"];
const SHIP_SLIDES = [
  {
    heading: "SCARAB INTERCEPTOR",
    model: "/models/fs1.glb",
    text: `CLASS: LIGHT ASSAULT RECON
ORIGIN: OUTER GRID FABRICATOR
HEALTH: 100
SHIELD: 0
ARMOR RATING: 15%

High mobility unit used for first-contact engagement.
Designed for speed and pilot suppression.`,
  },
  {
    heading: "REVENANT CRUISER",
    model: "/models/fs2.glb",
    text: `CLASS: TACTICAL SUPPRESSION VESSEL
ORIGIN: DEEP GRID WAR FOUNDRY
HEALTH: 300
SHIELD: 120
ARMOR RATING: 40%

Mid-weight combat ship with adaptive targeting
and partial shield regeneration.`,
  },
  {
    heading: "OBLIVION DREADCORE",
    model: "/models/fs3.glb",
    text: `CLASS: AUTONOMOUS WAR DREADNOUGHT
ORIGIN: SIGNAL SOURCE PRIME
HEALTH: 1200
SHIELD: 500
ARMOR RATING: 65%

Heavy-class extinction unit equipped with
singularity fusion core and rage protocol.`,
  },
];
const MISSION_SLIDES = [
  {
    heading: "THE ARRIVAL",
    text: `They came without warning.
No message. No demands.
Only extraction.

From orbit, they stripped Earth of oceans, minerals, power.
Cities burned beneath silent skies.`,
    image: "/textures/slide1.png",
  },
  {
    heading: "THE FALL",
    text: `Defense fleets failed. Nations collapsed.
Satellites went dark one by one.

Within months, humanity was no longer a civilization.

We were survivors.`,
    image: "/textures/slide2.png",
  },
  {
    heading: "THE RESISTANCE",
    text: `The remaining settlements moved underground.
Hidden beneath ruined continents.

Not refugees.

Resistance.

We built fortresses.
We built weapons.
We prepared for the worst.`,
    image: "/textures/slide3.png",
  },
  {
    heading: "THE SILENCE",
    text: `To survive, we erased ourselves.

A global Signal Jammer masks every emission.
No radio. No heat signatures. No trace.

As long as we remain silent…
they cannot find us.`,
    image: "/textures/slide4.png",
  },
  {
    heading: "THE BREACH",
    text: `But silence is fragile.

Power shifts. Systems falter.
For a few minutes — a signal escapes.

A Signal Breach.

And when it happens…
they respond.`,
    image: "/textures/slide5.png",
  },
  {
    heading: "PROTOCOL PROTECTOR",
    text: `Each settlement is guarded by a Defense Tower.

When breach protocol activates,
you take control of the cannon.

Hold the line.
Protect the settlement.
Restore the silence.

If the tower falls —
another piece of Earth is harvested.`,
    image: "/textures/slide6.png",
  },
];
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
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    setSlideIndex(0);
  }, [activeOverlay]);

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
    if (activeOverlay === "hangar") {
      const slide = SHIP_SLIDES[slideIndex];

      return (
        <div className="overlay-fullscreen mission-briefing">
          <button className="close-btn" onClick={closeOverlay}>
            ✕
          </button>

          <div className="briefing-container">
            <div className="hud-frame"></div>

            <div className="briefing-left">
              <h1 className="briefing-heading">{slide.heading}</h1>
              <p className="briefing-text">{slide.text}</p>
            </div>

            <div className="briefing-right">
              <ShipViewer modelPath={slide.model} />
            </div>
          </div>

          <div className="briefing-controls">
            <button
              onClick={() => setSlideIndex((prev) => Math.max(prev - 1, 0))}
              disabled={slideIndex === 0}
            >
              BACK
            </button>

            <button
              onClick={() =>
                setSlideIndex((prev) =>
                  Math.min(prev + 1, SHIP_SLIDES.length - 1),
                )
              }
            >
              NEXT
            </button>
          </div>
        </div>
      );
    }
    if (activeOverlay === "missions") {
      const slide = MISSION_SLIDES[slideIndex];

      return (
        <div className="overlay-fullscreen mission-briefing">
          <button className="close-btn" onClick={closeOverlay}>
            ✕
          </button>

          <div className="briefing-container">
            <div className="hud-frame"></div>
            <div className="briefing-left">
              <h1 className="briefing-heading">{slide.heading}</h1>

              <p className="briefing-text">{slide.text}</p>
            </div>

            <div className="briefing-right">
              <img src={slide.image} alt="Mission Slide" />
            </div>
          </div>

          <div className="briefing-controls">
            <button
              onClick={() => setSlideIndex((prev) => Math.max(prev - 1, 0))}
              disabled={slideIndex === 0}
            >
              BACK
            </button>

            <button
              onClick={() => {
                if (slideIndex < MISSION_SLIDES.length - 1) {
                  setSlideIndex((prev) => prev + 1);
                } else {
                  closeOverlay();
                  // optionally call startGame here
                }
              }}
            >
              {slideIndex === MISSION_SLIDES.length - 1 ? "DEPLOY" : "NEXT"}
            </button>
          </div>
        </div>
      );
    }
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



