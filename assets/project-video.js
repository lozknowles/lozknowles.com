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
    const keepControlsInteractive = (event) => event.stopPropagation();
    video.addEventListener("pointerdown", keepControlsInteractive);
    video.addEventListener("pointerup", keepControlsInteractive);

    video.addEventListener("error", () => showFallback(video));
    video.addEventListener("play", () => {
      backgroundMusic?.pause();
      videos.forEach((otherVideo) => {
        if (otherVideo !== video) otherVideo.pause();
      });
    });

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
