import "./overlay.css";
import { useEffect, useState } from "react";
import ShipViewer from "./ShipViewer";
import ArmoryViewer from "./ArmoryViewer";

const POPUP_OVERLAYS = [
  "home",
  "updates",
  "about",
  "contact",
  "news",
  "factions",
  "community",
];
const FULLSCREEN_OVERLAYS = ["missions", "armory", "hangar"];
const MAP_SLIDE = {
  heading: "SECTOR ECLIPSE-7",
  text: `Containment & Research Zone
Designation: 07 / 789 Outer Sectors

Hybrid defense complex built into terrain.
Core Vault Lab secured by shield perimeter.

Three defense towers in triangular formation.
Southern ridges provide elevation advantage.
Western trenches vulnerable to breach.
Enemy posts detected beyond ridge line.
`,
  image: "/textures/MAPS.jpg",
};
const ARMORY_SLIDE = {
  heading: "DEFENSE CANNON MK-IV",
  text: `Power Output: 4.2 MW
Weapon: Dual Plasma Rail Cannons
Range: 1.8 km
Fire Rate: 620 RPM
Target Lock: x3
Armor: Reactive Composite
Cooling: Cryo-Loop System
Response Time: 0.18 sec`,
};
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

As long as we remain silentâ€¦
they cannot find us.`,
    image: "/textures/slide4.png",
  },
  {
    heading: "THE BREACH",
    text: `But silence is fragile.

Power shifts. Systems falter.
For a few minutes â€” a signal escapes.

A Signal Breach.

And when it happensâ€¦
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

If the tower falls â€”
another piece of Earth is harvested.`,
    image: "/textures/slide6.png",
  },
];
const OVERLAY_CONTENT = {
  home: {
    title: "HOME",
    subtitle: "Command Overview",
    paragraphs: [
      "Welcome back, Commander. Eclipse-7 remains operational and all defense systems are currently online.",
      "Use the mission panels below to review active sectors, ship readiness, and weapons status before deployment.",
    ],
  },
  updates: {
    title: "UPDATES",
    subtitle: "Patch Notes // Build 0.9.4",
    paragraphs: [
      "Stability improvements applied to turret response, enemy flight paths, and target lock behavior.",
      "HUD readability improved for tactical values, system warnings, and mission outcome overlays.",
    ],
  },
  about: {
    title: "ABOUT",
    subtitle: "Signal Breach Program",
    paragraphs: [
      "Signal Breach is a defensive command simulation set during the final resistance phase on Earth.",
      "You operate settlement defense towers to intercept hostile fleets and protect surviving human sectors.",
    ],
  },
  contact: {
    title: "CONTACT",
    subtitle: "Transmission Relay",
    paragraphs: [
      "Command Uplink: contact@signalbreach.example",
      "Ops Channel: +1 (555) 014-7788",
      "Sector Grid: New Anchorage, Earth Defense Network",
    ],
  },
  news: {
    title: "NEWS ARCHIVE",
    subtitle: "Legacy Feed",
    paragraphs: ["Archived battlefield news and campaign logs are being synchronized."],
  },
  factions: {
    title: "FACTIONS",
    subtitle: "Legacy Entry",
    paragraphs: ["Faction alignment data has been migrated to mission command modules."],
  },
  community: {
    title: "COMMUNITY",
    subtitle: "Legacy Entry",
    paragraphs: ["Community relay channel will be available in a future release."],
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
  const data = OVERLAY_CONTENT[overlayKey] ||
    OVERLAY_CONTENT[activeOverlay] || {
      title: String(activeOverlay || "Overlay").toUpperCase(),
      subtitle: "No data configured",
      paragraphs: ["Add content in src/game/overlay.jsx (OVERLAY_CONTENT)."],
    };

  if (isPopup) {
    const paragraphs = Array.isArray(data.paragraphs)
      ? data.paragraphs
      : data.content
        ? [data.content]
        : [];

    return (
      <div className="overlay-popup">
        <div className={`overlay-modal overlay-modal-${activeOverlay}`}>
          <button className="close-btn" onClick={closeOverlay}>
            X
          </button>
          <div className="overlay-content">
            <h2>{data.title}</h2>
            {data.subtitle ? (
              <p className="overlay-subtitle">{data.subtitle}</p>
            ) : null}
            {paragraphs.map((paragraph, index) => (
              <p key={`${activeOverlay}-paragraph-${index}`} className="overlay-paragraph">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (activeOverlay === "map") {
    return (
      <div className="overlay-fullscreen mission-briefing">
        <button className="close-btn" onClick={closeOverlay}>
          X
        </button>

        <div className="briefing-container">
          <div className="hud-frame"></div>
          <div className="briefing-left">
            <h1 className="briefing-heading">{MAP_SLIDE.heading}</h1>
            <p className="briefing-text">{MAP_SLIDE.text}</p>
          </div>

          <div className="briefing-right briefing-right-map">
            <div className="map-wrapper">
              <img src={MAP_SLIDE.image} alt="Tactical Map" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isFullscreen) {
    if (activeOverlay === "armory") {
      return (
        <div className="overlay-fullscreen mission-briefing">
          <button className="close-btn" onClick={closeOverlay}>
            X
          </button>

          <div className="briefing-container">
            <div className="hud-frame"></div>

            <div className="briefing-left">
              <h1 className="briefing-heading">{ARMORY_SLIDE.heading}</h1>
              <p className="briefing-text">{ARMORY_SLIDE.text}</p>
            </div>

            <div className="briefing-right">
              <ArmoryViewer />
            </div>
          </div>
        </div>
      );
    }

    if (activeOverlay === "hangar") {
      const slide = SHIP_SLIDES[slideIndex];

      return (
        <div className="overlay-fullscreen mission-briefing">
          <button className="close-btn" onClick={closeOverlay}>
            X
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
            X
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
          X
        </button>

        <div className="overlay-content-fullscreen">
          <h1>{data.title}</h1>
          <p>{data.content}</p>
        </div>

        <button
          className="arrow arrow-left"
          onClick={() => handleTabChange("prev")}
        >
          â—€
        </button>

        <button
          className="arrow arrow-right"
          onClick={() => handleTabChange("next")}
        >
          â–¶
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
