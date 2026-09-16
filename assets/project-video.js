(() => {
  const cards = [...document.querySelectorAll(".project-card")];
  const videos = cards.flatMap((card) => [...card.querySelectorAll("video")]);
  const backgroundMusic = document.querySelector("#background-music");
  const visible = new Set();
  const userPaused = new Set();
  const managedPauses = new Set();

  function pauseVideo(video) {
    if (video.paused) return;
    managedPauses.add(video);
    video.pause();
  }

  function updatePlayback() {
    videos.forEach((video) => {
      const active = video.closest('.project-card')?.classList.contains('is-active');
      if (document.hidden || !active || !visible.has(video)) {
        pauseVideo(video);
      } else if (!navigator.connection?.saveData && !userPaused.has(video) && video.paused) {
        // Muted, inline playback is accepted by normal browser autoplay policies.
        // The play control remains available if the browser still declines.
        video.play().catch(() => {});
      }
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
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;
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
      userPaused.delete(video);
      container?.classList.add("is-playing");
      playButton.hidden = true;
      if (!video.muted && video.volume > 0) backgroundMusic?.pause();
      videos.forEach((otherVideo) => {
        if (otherVideo !== video) pauseVideo(otherVideo);
      });
    });
    video.addEventListener("pause", () => {
      if (!managedPauses.delete(video)) userPaused.add(video);
      container?.classList.remove("is-playing");
      playButton.hidden = false;
    });
    video.addEventListener('volumechange', () => {
      if (!video.paused && !video.muted && video.volume > 0) backgroundMusic?.pause();
    });

    if (video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      showFallback(video);
    }
  });

  const observer = new MutationObserver(updatePlayback);
  cards.forEach((card) => {
    observer.observe(card, { attributes: true, attributeFilter: ["class"] });
  });

  const viewport = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && entry.intersectionRatio >= .25) visible.add(entry.target);
      else visible.delete(entry.target);
    });
    updatePlayback();
  }, { threshold: [0, .25] });
  videos.forEach(video => viewport.observe(video));
  document.addEventListener("visibilitychange", updatePlayback);
})();
