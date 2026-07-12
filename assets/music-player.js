(() => {
  const audio = document.querySelector("#background-music");
  const toggle = document.querySelector("#music-toggle");
  const label = toggle?.querySelector(".music-toggle__label");

  if (!audio || !toggle || !label) return;

  audio.volume = 0.28;

  const showState = (playing) => {
    toggle.setAttribute("aria-pressed", String(playing));
    toggle.setAttribute(
      "aria-label",
      playing ? "Pause background music" : "Play background music"
    );
    label.textContent = playing ? "Pause music" : "Play music";
  };

  toggle.addEventListener("click", async () => {
    if (!audio.paused) {
      audio.pause();
      showState(false);
      return;
    }

    try {
      await audio.play();
      showState(true);
    } catch {
      showState(false);
    }
  });

  audio.addEventListener("pause", () => showState(false));
  audio.addEventListener("play", () => showState(true));
})();
