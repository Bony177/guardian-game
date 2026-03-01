let bgm = null;
let isPlaying = false;

export function initMusic() {
  if (bgm) return;

  bgm = new Audio("/audio/ribhavagrawal-the-beginning.mp3");
  bgm.loop = true;
  bgm.volume = 0.4;
  bgm.preload = "auto";
}

export function startMusic() {
  if (!bgm) initMusic();
  if (isPlaying) return;

  bgm.play()
    .then(() => {
      isPlaying = true;
      console.log("🎵 Background music started");
    })
    .catch((err) => {
      console.warn("Music blocked:", err);
    });
}

export function stopMusic() {
  if (!bgm) return;

  bgm.pause();
  bgm.currentTime = 0;
  isPlaying = false;
}

export function fadeOutMusic(duration = 2000) {
  if (!bgm) return;

  const step = 0.05;
  const interval = setInterval(() => {
    if (bgm.volume > step) {
      bgm.volume -= step;
    } else {
      clearInterval(interval);
      stopMusic();
      bgm.volume = 0.4; // reset for next time
    }
  }, duration * step);
}