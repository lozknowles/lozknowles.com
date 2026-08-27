(() => {
  const carousel = document.querySelector("[data-reference-carousel]");
  if (!carousel) return;

  const cards = [...carousel.querySelectorAll("[data-reference-card]")];
  const previousButton = carousel.querySelector("[data-reference-previous]");
  const nextButton = carousel.querySelector("[data-reference-next]");
  const rotationButton = carousel.querySelector("[data-reference-rotation]");
  const position = carousel.querySelector("[data-reference-position]");
  const announcement = carousel.querySelector("[data-reference-announcement]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const interval = 12000;

  let activeIndex = 0;
  let timer;
  let pausedByInteraction = false;
  let rotationEnabled = !reducedMotion.matches;

  document.documentElement.classList.add("references-enhanced");

  const clearTimer = () => {
    window.clearTimeout(timer);
    timer = undefined;
  };

  const updateRotationButton = () => {
    if (!rotationButton) return;
    rotationButton.textContent = rotationEnabled ? "Pause rotation" : "Start rotation";
    rotationButton.setAttribute("aria-pressed", String(rotationEnabled));
  };

  const scheduleRotation = () => {
    clearTimer();
    if (!rotationEnabled || pausedByInteraction || document.hidden || cards.length < 2) return;

    timer = window.setTimeout(() => {
      showCard(activeIndex + 1);
    }, interval);
  };

  const showCard = (requestedIndex, announce = false) => {
    activeIndex = (requestedIndex + cards.length) % cards.length;

    cards.forEach((card, index) => {
      card.hidden = index !== activeIndex;
    });

    if (position) position.textContent = `${activeIndex + 1} / ${cards.length}`;
    if (announce && announcement) {
      const name = cards[activeIndex].querySelector("cite")?.textContent || "reference";
      announcement.textContent = `Showing reference ${activeIndex + 1} of ${cards.length}, from ${name}.`;
    }

    scheduleRotation();
  };

  previousButton?.addEventListener("click", () => showCard(activeIndex - 1, true));
  nextButton?.addEventListener("click", () => showCard(activeIndex + 1, true));
  rotationButton?.addEventListener("click", () => {
    rotationEnabled = !rotationEnabled;
    updateRotationButton();
    scheduleRotation();
  });

  carousel.addEventListener("mouseenter", () => {
    pausedByInteraction = true;
    clearTimer();
  });
  carousel.addEventListener("mouseleave", () => {
    pausedByInteraction = false;
    scheduleRotation();
  });
  carousel.addEventListener("focusin", () => {
    pausedByInteraction = true;
    clearTimer();
  });
  carousel.addEventListener("focusout", (event) => {
    if (carousel.contains(event.relatedTarget)) return;
    pausedByInteraction = false;
    scheduleRotation();
  });
  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showCard(activeIndex - 1, true);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showCard(activeIndex + 1, true);
    }
  });
  document.addEventListener("visibilitychange", scheduleRotation);

  updateRotationButton();
  showCard(0);
})();
