(() => {
  const cards = [...document.querySelectorAll(".project-card")];
  const videos = cards.flatMap((card) => [...card.querySelectorAll("video")]);
  const backgroundMusic = document.querySelector("#background-music");

  function pauseInactiveVideos() {
    cards.forEach((card) => {
      if (card.classList.contains("is-active")) return;
      card.querySelectorAll("video").forEach((video) => video.pause());
    });
  }

  function showFallback(video) {
    const container = video.closest(".project-video");
    if (!container || container.classList.contains("video-unavailable")) return;

    const title = container.closest(".project-card")?.querySelector("h3")?.textContent;
    const image = document.createElement("img");
    image.className = "video-fallback";
    image.src = video.poster;
    image.alt = title ? `${title} preview` : "Experiment preview";
    container.append(image);
    container.classList.add("video-unavailable");
  }

  videos.forEach((video) => {
    const container = video.closest(".project-video");
    const title = container?.closest(".project-card")?.querySelector("h3")?.textContent;
    const playButton = document.createElement("button");
    playButton.className = "video-play";
    playButton.type = "button";
    playButton.setAttribute("aria-label", `Play ${title || "experiment"}`);
    playButton.textContent = "▶";
    container?.append(playButton);

    const keepControlsInteractive = (event) => event.stopPropagation();
    video.addEventListener("pointerdown", keepControlsInteractive);
    video.addEventListener("pointerup", keepControlsInteractive);
    playButton.addEventListener("pointerdown", keepControlsInteractive);
    playButton.addEventListener("pointerup", keepControlsInteractive);
    playButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      try {
        await video.play();
      } catch (error) {
        console.error("Experiment video failed to play", error);
        container?.classList.remove("is-playing");
      }
    });

    video.addEventListener("error", () => showFallback(video));
    video.addEventListener("play", () => {
      container?.classList.add("is-playing");
      backgroundMusic?.pause();
      videos.forEach((otherVideo) => {
        if (otherVideo !== video) otherVideo.pause();
      });
    });
    video.addEventListener("pause", () => container?.classList.remove("is-playing"));

    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      showFallback(video);
    }
  });

  const observer = new MutationObserver(pauseInactiveVideos);
  cards.forEach((card) => {
    observer.observe(card, { attributes: true, attributeFilter: ["class"] });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) videos.forEach((video) => video.pause());
  });
})();
