(() => {
  "use strict";
  const DEFAULT_BIRD_COUNT = 100;
  const MIN_BIRD_COUNT = 10;
  const MAX_BIRD_COUNT = 2500;
  const MAX_NEIGHBOUR_RADIUS = 88;
  const TOPOLOGICAL_NEIGHBOURS = 7;
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
  const formation = {
    active: false,
    nextAt: performance.now() + 6000 + Math.random() * 6000,
    startedAt: 0,
    duration: 0,
    originX: 0,
    originY: 0,
    angle: 0,
    spin: 1,
    phase: 0
  };

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
  const formationFlow = now => {
    if (!formation.active && now >= formation.nextAt) {
      formation.active = true;
      formation.startedAt = now;
      formation.duration = 10000 + Math.random() * 4500;
      formation.originX = width * (.35 + Math.random() * .3);
      formation.originY = height * (.35 + Math.random() * .3);
      formation.angle = Math.random() * TAU;
      formation.spin = Math.random() < .5 ? -1 : 1;
      formation.phase = Math.random() * TAU;
    }
    if (!formation.active) return { intensity: 0, compression: 0, ribbon: 0 };
    const progress = (now - formation.startedAt) / formation.duration;
    if (progress >= 1) {
      formation.active = false;
      formation.nextAt = now + 15000 + Math.random() * 15000;
      return { intensity: 0, compression: 0, ribbon: 0 };
    }
    const intensity = Math.pow(Math.sin(progress * Math.PI), 2);
    const transition = Math.max(0, Math.min(1, (progress - .25) / .35));
    const compression = intensity * (1 - transition * .6);
    const ribbon = intensity * (.25 + transition * .75);
    const flowX = Math.cos(formation.angle);
    const flowY = Math.sin(formation.angle);
    const travel = Math.max(0, (progress - .28) / .72) * Math.min(width, height) * .68;
    let centerX = formation.originX + flowX * travel;
    let centerY = formation.originY + flowY * travel;
    if (avoidEdges) {
      centerX = Math.max(width * .18, Math.min(width * .82, centerX));
      centerY = Math.max(height * .18, Math.min(height * .82, centerY));
    } else {
      centerX = (centerX + width) % width;
      centerY = (centerY + height) % height;
    }
    return { intensity, compression, ribbon, progress, flowX, flowY, centerX, centerY, spin: formation.spin, phase: formation.phase };
  };
  const seedBirds = () => {
    const cx = width * .5;
    const cy = height * .48;
    birds = Array.from({ length: birdCount }, (_, i) => {
      const angle = i / birdCount * TAU + Math.random() * .5;
      const radius = Math.sqrt(Math.random()) * Math.min(width, height) * .26;
      const direction = angle + Math.PI / 2 + (Math.random() - .5);
      const speed = .85 + Math.random() * .85;
      return {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius * .55,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        ax: 0,
        ay: 0,
        fear: 0,
        bank: 0,
        phase: Math.random() * TAU,
        preferredSpeed: 1.35 + Math.random() * .45
      };
    });
  };
  const buildNeighbourGrid = neighbourRadius => {
    const columns = Math.max(1, Math.ceil(width / neighbourRadius));
    const rows = Math.max(1, Math.ceil(height / neighbourRadius));
    const grid = Array.from({ length: columns * rows }, () => []);
    birds.forEach((bird, index) => {
      const column = Math.min(columns - 1, Math.floor(bird.x / neighbourRadius));
      const row = Math.min(rows - 1, Math.floor(bird.y / neighbourRadius));
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
    const bank = Math.max(-.8, Math.min(.8, bird.bank || 0));
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(17,17,24,.84)";
    ctx.beginPath();
    ctx.moveTo(size * 1.65, 0);
    ctx.lineTo(-size * .7, -size * .38);
    ctx.lineTo(-size * 1.35, -size * (1.1 + bank * .28));
    ctx.lineTo(-size * .25, -size * .3);
    ctx.lineTo(-size * .55, size * (.7 - bank * .18));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  const update = () => {
    const neighbourRadius = Math.max(18, Math.min(MAX_NEIGHBOUR_RADIUS, 900 / Math.sqrt(birds.length)));
    const { grid, columns, rows } = buildNeighbourGrid(neighbourRadius);
    const nextStates = new Array(birds.length);
    const now = performance.now();
    const time = now * .001;
    const flow = formationFlow(now);
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      const nearest = [];
      const ownColumn = Math.min(columns - 1, Math.floor(bird.x / neighbourRadius));
      const ownRow = Math.min(rows - 1, Math.floor(bird.y / neighbourRadius));
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
            if (distSq < neighbourRadius * neighbourRadius) {
              if (nearest.length === TOPOLOGICAL_NEIGHBOURS && distSq >= nearest[nearest.length - 1].distSq) continue;
              const neighbour = { bird: other, dx, dy, distSq };
              let position = nearest.length;
              while (position > 0 && nearest[position - 1].distSq > distSq) position--;
              nearest.splice(position, 0, neighbour);
              if (nearest.length > TOPOLOGICAL_NEIGHBOURS) nearest.pop();
            }
          }
        }
      }
      let alignX = 0, alignY = 0, cohesionX = 0, cohesionY = 0;
      let separateX = 0, separateY = 0, totalWeight = 0, neighbourFear = 0;
      const speed = Math.hypot(bird.vx, bird.vy) || 1;
      const headingX = bird.vx / speed;
      const headingY = bird.vy / speed;
      nearest.forEach(neighbour => {
        const distance = Math.sqrt(neighbour.distSq) || .01;
        const facing = (neighbour.dx * headingX + neighbour.dy * headingY) / distance;
        const weight = (facing < -.35 ? .32 : 1) * (1 - distance / neighbourRadius * .25);
        alignX += neighbour.bird.vx * weight;
        alignY += neighbour.bird.vy * weight;
        cohesionX += neighbour.dx * weight;
        cohesionY += neighbour.dy * weight;
        totalWeight += weight;
        neighbourFear = Math.max(neighbourFear, neighbour.bird.fear * (1 - distance / (neighbourRadius * 1.35)));
        const spacing = 27 - flow.compression * 14;
        if (distance < spacing) {
          const pressure = Math.pow(1 - distance / spacing, 2);
          separateX -= neighbour.dx / distance * pressure;
          separateY -= neighbour.dy / distance * pressure;
        }
      });
      let ax = 0, ay = 0;
      if (totalWeight) {
        const align = limit(alignX / totalWeight, alignY / totalWeight, 2.15);
        const cohesion = limit(cohesionX / totalWeight, cohesionY / totalWeight, 1.3);
        const compression = 1 + flow.compression * 4.5;
        const separation = .19 * (1 - flow.compression * .7);
        ax += (align.x - bird.vx) * .042 + cohesion.x * .009 * compression + separateX * separation;
        ay += (align.y - bird.vy) * .042 + cohesion.y * .009 * compression + separateY * separation;
      }
      let directFear = 0;
      if (predator.active) {
        const dx = spatialDelta(predator.x, bird.x, width);
        const dy = spatialDelta(predator.y, bird.y, height);
        const distance = Math.hypot(dx, dy);
        if (distance < 175 && distance > .1) {
          directFear = Math.pow(1 - distance / 175, 2);
          const escape = .18 + directFear * .64;
          ax += dx / distance * escape; ay += dy / distance * escape;
        }
      }
      const fear = Math.max(directFear, bird.fear * .955, neighbourFear * .92);
      if (flow.intensity) {
        const toCenterX = spatialDelta(bird.x, flow.centerX, width);
        const toCenterY = spatialDelta(bird.y, flow.centerY, height);
        const centerDistance = Math.hypot(toCenterX, toCenterY) || 1;
        const reach = Math.min(width, height) * .62;
        const proximity = Math.max(0, 1 - centerDistance / reach);
        const influence = (.35 + proximity * .65) * flow.intensity * (1 - fear * .72);
        if (influence) {
          const inwardX = toCenterX / centerDistance;
          const inwardY = toCenterY / centerDistance;
          const tangentX = -inwardY * flow.spin;
          const tangentY = inwardX * flow.spin;
          const alongRibbon = bird.x * flow.flowX + bird.y * flow.flowY;
          const ribbonWave = Math.sin(alongRibbon * .022 - time * 3.1 + flow.phase);
          const radialWave = Math.sin(centerDistance * .052 - time * 3.7 + flow.phase);
          const ribbonX = flow.flowX - flow.flowY * ribbonWave * .58;
          const ribbonY = flow.flowY + flow.flowX * ribbonWave * .58;
          const inwardPull = .055 + flow.compression * .22 + radialWave * .16 * flow.ribbon;
          ax += (inwardX * inwardPull + tangentX * .045 * flow.ribbon + ribbonX * .034 * flow.ribbon) * influence;
          ay += (inwardY * inwardPull + tangentY * .045 * flow.ribbon + ribbonY * .034 * flow.ribbon) * influence;
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
      const wander = Math.sin(time * .72 + bird.phase) * .0045;
      ax += -headingY * wander - bird.vy * .0012;
      ay += headingX * wander + bird.vx * .0012;
      const desiredSpeed = bird.preferredSpeed + fear * 1.8 + flow.intensity * 1.25 + Math.sin(time * .38 + bird.phase * .7) * .08;
      ax += headingX * (desiredSpeed - speed) * .025;
      ay += headingY * (desiredSpeed - speed) * .025;
      const steering = limit(ax, ay, .075 + fear * .16 + flow.intensity * .08);
      const response = .2 + fear * .32 + flow.intensity * .12;
      const smoothed = limit(
        bird.ax * (1 - response) + steering.x * response,
        bird.ay * (1 - response) + steering.y * response,
        .065 + fear * .15 + flow.intensity * .07
      );
      let vx = bird.vx + smoothed.x;
      let vy = bird.vy + smoothed.y;
      const velocity = limit(vx, vy, 3.9);
      const nextSpeed = Math.hypot(velocity.x, velocity.y);
      vx = nextSpeed < .9 ? velocity.x / (nextSpeed || 1) * .9 : velocity.x;
      vy = nextSpeed < .9 ? velocity.y / (nextSpeed || 1) * .9 : velocity.y;
      const newSpeed = Math.hypot(vx, vy) || 1;
      const bank = bird.bank * .78 + (headingX * vy / newSpeed - headingY * vx / newSpeed) * 3.4;
      let x;
      let y;
      if (avoidEdges) {
        x = bird.x + vx;
        y = bird.y + vy;
        if (x < 1) { x = 1; vx = Math.abs(vx) * .55; }
        if (x > width - 1) { x = width - 1; vx = -Math.abs(vx) * .55; }
        if (y < 1) { y = 1; vy = Math.abs(vy) * .55; }
        if (y > height - 1) { y = height - 1; vy = -Math.abs(vy) * .55; }
      } else {
        x = (bird.x + vx + width) % width;
        y = (bird.y + vy + height) % height;
      }
      nextStates[i] = { x, y, vx, vy, ax: smoothed.x, ay: smoothed.y, fear, bank };
    }
    birds.forEach((bird, index) => Object.assign(bird, nextStates[index]));
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
