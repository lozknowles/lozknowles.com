(() => {
  const cards = [...document.querySelectorAll(".project-card")];
  const videos = cards.flatMap((card) => [...card.querySelectorAll("video")]);
  const backgroundMusic = document.querySelector("#background-music");
  const visible = new Set();
  const userPaused = new Set();
  const managedPauses = new Set();
  const pending = new Set();
  const controlInput = new WeakMap();
  const recoveryAttempts = new WeakMap();
  const recoveryTimers = new WeakMap();

  function isOnScreen(video) {
    return !document.hidden && visible.has(video) &&
      video.closest('.project-card')?.classList.contains('is-active');
  }

  function clearRecovery(video) {
    clearTimeout(recoveryTimers.get(video));
    recoveryTimers.delete(video);
  }

  function pauseVideo(video) {
    if (video.paused) return;
    managedPauses.add(video);
    video.pause();
  }

  function updatePlayback() {
    videos.forEach((video) => {
      const onScreen = isOnScreen(video);
      const shouldPlay = onScreen && !navigator.connection?.saveData && !userPaused.has(video);
      // The native flag also lets the browser start when enough media has loaded.
      video.autoplay = shouldPlay;
      if (!onScreen) {
        clearRecovery(video);
        recoveryAttempts.delete(video);
        pauseVideo(video);
      } else if (shouldPlay && video.paused && !pending.has(video)) {
        pending.add(video);
        video.play().then(() => {
          // A delayed play request must not restart a card after it has left view.
          if (!isOnScreen(video)) pauseVideo(video);
        }).catch(() => {
          // Readiness, page restoration or the next interaction can retry.
          // Keep the explicit Play control available if autoplay is blocked.
        }).finally(() => pending.delete(video));
      }
    });
  }

  function recoverPlayback(video) {
    if (!isOnScreen(video) || userPaused.has(video) || recoveryTimers.has(video)) return;
    const attempts = recoveryAttempts.get(video) || 0;
    if (attempts >= 2) return; // Do not repeatedly fight a browser autoplay policy.
    recoveryAttempts.set(video, attempts + 1);
    recoveryTimers.set(video, setTimeout(() => {
      recoveryTimers.delete(video);
      updatePlayback();
    }, 200));
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

    const keepControlsInteractive = (event) => {
      controlInput.set(video, performance.now());
      event.stopPropagation();
    };
    video.addEventListener("pointerdown", keepControlsInteractive);
    video.addEventListener("pointerup", keepControlsInteractive);
    playButton.addEventListener("pointerdown", keepControlsInteractive);
    playButton.addEventListener("pointerup", keepControlsInteractive);
    video.addEventListener('keydown', (event) => {
      if ([' ', 'Enter', 'k', 'K', 'MediaPlayPause'].includes(event.key)) {
        controlInput.set(video, performance.now());
      }
    });
    playButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      userPaused.delete(video);
      clearRecovery(video);
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
      if (!video.muted && video.volume > 0) backgroundMusic?.pause();
      videos.forEach((otherVideo) => {
        if (otherVideo !== video) pauseVideo(otherVideo);
      });
    });
    // 'play' can fire before a single frame is ready; reflect actual playback.
    video.addEventListener('playing', () => {
      container?.classList.add('is-playing');
      playButton.hidden = true;
    });
    video.addEventListener("pause", () => {
      const managed = managedPauses.delete(video);
      const inputTime = controlInput.get(video);
      controlInput.delete(video);
      // A browser can pause a hidden/loading video before our observer runs.
      // Only a pause following an interaction with its controls is user intent.
      if (!managed && isOnScreen(video) && inputTime !== undefined && performance.now() - inputTime < 1000) {
        userPaused.add(video);
        video.autoplay = false;
      }
      container?.classList.remove("is-playing");
      playButton.hidden = false;
      if (!managed) recoverPlayback(video);
    });
    const mediaReady = () => {
      // Source selection can briefly report NETWORK_NO_SOURCE while loading.
      // If media recovers, remove any old poster fallback so it can enter view.
      container?.classList.remove('video-unavailable');
      container?.querySelector('.video-fallback')?.remove();
      updatePlayback();
    };
    video.addEventListener('loadeddata', mediaReady);
    video.addEventListener('canplay', mediaReady);
    video.addEventListener('volumechange', () => {
      if (!video.paused && !video.muted && video.volume > 0) backgroundMusic?.pause();
    });

    // Only a real media error means unavailable; networkState is transitional.
    if (video.error) {
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
  window.addEventListener('pageshow', updatePlayback);
  window.addEventListener('focus', updatePlayback);
  // Retry within a real gesture if the initial browser play request was denied.
  ['pointerdown', 'keydown', 'touchstart'].forEach(type => {
    window.addEventListener(type, event => {
      if (videos.some(video => video === event.target || video.contains(event.target))) return;
      updatePlayback();
    }, { passive: true });
  });
})();
