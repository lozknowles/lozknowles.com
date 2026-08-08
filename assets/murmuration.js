(() => {
  "use strict";
  const DEFAULT_BIRD_COUNT = 100;
  const MIN_BIRD_COUNT = 10;
  const MAX_BIRD_COUNT = 500;
  const NEIGHBOUR_RADIUS = 76;
  const EDGE_MARGIN = 96;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("murmuration");
  const ctx = canvas.getContext("2d");
  const pauseButton = document.getElementById("pause");
  const gatherButton = document.getElementById("gather");
  const birdCountInput = document.getElementById("bird-count");
  const edgeModeInput = document.getElementById("avoid-edges");
  const edgeDescription = document.getElementById("edge-description");
  const cloudToggle = document.getElementById("show-clouds");
  const cloudLayer = document.getElementById("cloud-layer");
  const invitation = document.getElementById("invitation");
  let birds = [];
  let width = 0;
  let height = 0;
  let paused = false;
  let birdCount = DEFAULT_BIRD_COUNT;
  let avoidEdges = false;
  const predator = { x: 0, y: 0, active: false };

  const limit = (x, y, max) => {
    const length = Math.hypot(x, y);
    return length > max ? { x: x / length * max, y: y / length * max } : { x, y };
  };
  const wrappedDelta = (a, b, size) => {
    let d = b - a;
    if (d > size / 2) d -= size;
    if (d < -size / 2) d += size;
    return d;
  };
  const spatialDelta = (a, b, size) => avoidEdges ? b - a : wrappedDelta(a, b, size);
  const seedBirds = () => {
    const cx = width * .5;
    const cy = height * .48;
    birds = Array.from({ length: birdCount }, (_, i) => {
      const angle = i / birdCount * TAU + Math.random() * .5;
      const radius = Math.sqrt(Math.random()) * Math.min(width, height) * .26;
      const direction = angle + Math.PI / 2 + (Math.random() - .5);
      const speed = .85 + Math.random() * .85;
      return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * .55, vx: Math.cos(direction) * speed, vy: Math.sin(direction) * speed };
    });
  };
  const buildNeighbourGrid = () => {
    const columns = Math.max(1, Math.ceil(width / NEIGHBOUR_RADIUS));
    const rows = Math.max(1, Math.ceil(height / NEIGHBOUR_RADIUS));
    const grid = Array.from({ length: columns * rows }, () => []);
    birds.forEach((bird, index) => {
      const column = Math.min(columns - 1, Math.floor(bird.x / NEIGHBOUR_RADIUS));
      const row = Math.min(rows - 1, Math.floor(bird.y / NEIGHBOUR_RADIUS));
      grid[row * columns + column].push(index);
    });
    return { grid, columns, rows };
  };
  const resize = () => {
    const box = canvas.getBoundingClientRect();
    const oldWidth = width;
    const oldHeight = height;
    width = box.width;
    height = box.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!birds.length) seedBirds();
    else if (oldWidth && oldHeight) birds.forEach(bird => { bird.x = bird.x / oldWidth * width; bird.y = bird.y / oldHeight * height; });
  };
  const drawBird = bird => {
    const angle = Math.atan2(bird.vy, bird.vx);
    const size = 3.25 + Math.min(Math.hypot(bird.vx, bird.vy), 3) * .65;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(17,17,24,.84)";
    ctx.beginPath();
    ctx.moveTo(size * 1.65, 0);
    ctx.lineTo(-size * .7, -size * .38);
    ctx.lineTo(-size * 1.35, -size * 1.1);
    ctx.lineTo(-size * .25, -size * .3);
    ctx.lineTo(-size * .55, size * .7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  const update = () => {
    const { grid, columns, rows } = buildNeighbourGrid();
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      let alignX = 0, alignY = 0, cohesionX = 0, cohesionY = 0, separateX = 0, separateY = 0, neighbours = 0;
      const ownColumn = Math.min(columns - 1, Math.floor(bird.x / NEIGHBOUR_RADIUS));
      const ownRow = Math.min(rows - 1, Math.floor(bird.y / NEIGHBOUR_RADIUS));
      for (let cellY = -1; cellY <= 1; cellY++) {
        for (let cellX = -1; cellX <= 1; cellX++) {
          const candidateColumn = ownColumn + cellX;
          const candidateRow = ownRow + cellY;
          if (avoidEdges && (candidateColumn < 0 || candidateColumn >= columns || candidateRow < 0 || candidateRow >= rows)) continue;
          const column = (candidateColumn + columns) % columns;
          const row = (candidateRow + rows) % rows;
          const candidates = grid[row * columns + column];
          for (const j of candidates) {
            if (i === j) continue;
            const other = birds[j];
            const dx = spatialDelta(bird.x, other.x, width);
            const dy = spatialDelta(bird.y, other.y, height);
            const distSq = dx * dx + dy * dy;
            if (distSq < NEIGHBOUR_RADIUS * NEIGHBOUR_RADIUS) {
              alignX += other.vx; alignY += other.vy; cohesionX += dx; cohesionY += dy; neighbours++;
              if (distSq < 25 * 25 && distSq > .01) {
                const force = 1 / Math.sqrt(distSq);
                separateX -= dx * force; separateY -= dy * force;
              }
            }
          }
        }
      }
      let ax = 0, ay = 0;
      if (neighbours) {
        const align = limit(alignX / neighbours, alignY / neighbours, 1.9);
        const cohesion = limit(cohesionX / neighbours, cohesionY / neighbours, 1.2);
        ax += (align.x - bird.vx) * .034 + cohesion.x * .008 + separateX * .075;
        ay += (align.y - bird.vy) * .034 + cohesion.y * .008 + separateY * .075;
      }
      if (predator.active) {
        const dx = spatialDelta(predator.x, bird.x, width);
        const dy = spatialDelta(predator.y, bird.y, height);
        const distance = Math.hypot(dx, dy);
        if (distance < 155 && distance > .1) {
          const fear = Math.pow(1 - distance / 155, 2) * .72;
          ax += dx / distance * fear; ay += dy / distance * fear;
        }
      }
      if (avoidEdges) {
        const horizontalMargin = Math.min(EDGE_MARGIN, width * .25);
        const verticalMargin = Math.min(EDGE_MARGIN, height * .25);
        if (bird.x < horizontalMargin) ax += (1 - bird.x / horizontalMargin) * .18;
        if (bird.x > width - horizontalMargin) ax -= (1 - (width - bird.x) / horizontalMargin) * .18;
        if (bird.y < verticalMargin) ay += (1 - bird.y / verticalMargin) * .18;
        if (bird.y > height - verticalMargin) ay -= (1 - (height - bird.y) / verticalMargin) * .18;
      }
      ax += -bird.vy * .0016; ay += bird.vx * .0016;
      bird.vx += ax; bird.vy += ay;
      const velocity = limit(bird.vx, bird.vy, 3.15);
      const speed = Math.hypot(velocity.x, velocity.y);
      bird.vx = speed < 1.05 ? velocity.x / (speed || 1) * 1.05 : velocity.x;
      bird.vy = speed < 1.05 ? velocity.y / (speed || 1) * 1.05 : velocity.y;
      if (avoidEdges) {
        bird.x += bird.vx;
        bird.y += bird.vy;
        if (bird.x < 1) { bird.x = 1; bird.vx = Math.abs(bird.vx) * .55; }
        if (bird.x > width - 1) { bird.x = width - 1; bird.vx = -Math.abs(bird.vx) * .55; }
        if (bird.y < 1) { bird.y = 1; bird.vy = Math.abs(bird.vy) * .55; }
        if (bird.y > height - 1) { bird.y = height - 1; bird.vy = -Math.abs(bird.vy) * .55; }
      } else {
        bird.x = (bird.x + bird.vx + width) % width;
        bird.y = (bird.y + bird.vy + height) % height;
      }
    }
  };
  const drawPredator = () => {
    const pulse = 39 + Math.sin(performance.now() / 240) * 3;
    const gradient = ctx.createRadialGradient(predator.x, predator.y, 4, predator.x, predator.y, pulse);
    gradient.addColorStop(0, "rgba(177,68,38,.22)");
    gradient.addColorStop(1, "rgba(177,68,38,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath(); ctx.arc(predator.x, predator.y, pulse, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(predator.x, predator.y); ctx.fillStyle = "#9e3e28";
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.quadraticCurveTo(2, -3, -14, -11); ctx.quadraticCurveTo(-5, 0, -14, 11); ctx.quadraticCurveTo(2, 3, 16, 0); ctx.fill(); ctx.restore();
  };
  const frame = () => {
    ctx.clearRect(0, 0, width, height);
    if (!paused) update();
    birds.forEach(drawBird);
    if (predator.active) drawPredator();
    requestAnimationFrame(frame);
  };
  const movePredator = event => {
    const box = canvas.getBoundingClientRect();
    predator.x = event.clientX - box.left;
    predator.y = event.clientY - box.top;
    predator.active = true;
    invitation.classList.add("hidden");
  };
  canvas.addEventListener("pointermove", movePredator);
  canvas.addEventListener("pointerdown", event => { canvas.setPointerCapture(event.pointerId); movePredator(event); });
  canvas.addEventListener("pointerleave", () => { predator.active = false; });
  pauseButton.addEventListener("click", () => { paused = !paused; pauseButton.textContent = paused ? "Resume" : "Pause"; });
  gatherButton.addEventListener("click", seedBirds);
  birdCountInput.addEventListener("change", () => {
    const requested = Number.parseInt(birdCountInput.value, 10);
    birdCount = Number.isFinite(requested) ? Math.min(MAX_BIRD_COUNT, Math.max(MIN_BIRD_COUNT, requested)) : DEFAULT_BIRD_COUNT;
    birdCountInput.value = String(birdCount);
    seedBirds();
  });
  birdCountInput.addEventListener("keydown", event => { if (event.key === "Enter") birdCountInput.blur(); });
  edgeModeInput.addEventListener("change", () => {
    avoidEdges = edgeModeInput.checked;
    edgeDescription.textContent = avoidEdges
      ? "Soft boundary active · the flock will turn before the edge"
      : "There are no edges here · every horizon leads back to the sky";
  });
  cloudToggle.addEventListener("change", () => {
    cloudLayer.classList.toggle("clouds-hidden", !cloudToggle.checked);
  });
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
})();
