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

  const startOnFirstInteraction = async (event) => {
    if (event.target instanceof Node && toggle.contains(event.target)) return;

    try {
      await audio.play();
      showState(true);
      interactionEvents.forEach((eventName) =>
        window.removeEventListener(eventName, startOnFirstInteraction)
      );
    } catch {
      showState(false);
    }
  };

  const interactionEvents = ["pointerdown", "keydown", "touchstart", "wheel"];

  audio.play().then(
    () => showState(true),
    () => {
      showState(false);
      interactionEvents.forEach((eventName) =>
        window.addEventListener(eventName, startOnFirstInteraction, {
          passive: true,
          once: true,
        })
      );
    }
  );
})();
