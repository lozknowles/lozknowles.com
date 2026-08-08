(() => {
  "use strict";
  const DEFAULT_BIRD_COUNT = 2500;
  const MIN_BIRD_COUNT = 10;
  const MAX_BIRD_COUNT = 2500;
  const MAX_NEIGHBOUR_RADIUS = 88;
  const TOPOLOGICAL_NEIGHBOURS = 7;
  const EDGE_MARGIN = 96;
  const MOON_VIEW_PARALLAX = .18;
  const NEUTRAL_VIEW_PITCH = .48;
  const TAU = Math.PI * 2;
  const canvas = document.getElementById("murmuration");
  const ctx = canvas.getContext("2d");
  const pauseButton = document.getElementById("pause");
  const gatherButton = document.getElementById("gather");
  const birdCountInput = document.getElementById("bird-count");
  const speedInput = document.getElementById("flight-speed");
  const speedOutput = document.getElementById("speed-output");
  const edgeModeInput = document.getElementById("avoid-edges");
  const edgeDescription = document.getElementById("edge-description");
  const cloudToggle = document.getElementById("show-clouds");
  const cloudLayer = document.getElementById("cloud-layer");
  const duskToggle = document.getElementById("dusk-sky");
  const risingMoon = document.getElementById("rising-moon");
  const viewModeInput = document.getElementById("inside-flock");
  const gameShell = document.getElementById("game-shell");
  const immersiveHud = document.getElementById("immersive-hud");
  const viewpointMap = document.getElementById("viewpoint-map");
  const mapCtx = viewpointMap.getContext("2d");
  const invitation = document.getElementById("invitation");
  const invitationText = document.getElementById("invitation-text");
  const modeIntroduction = document.getElementById("mode-introduction");
  let birds = [];
  let width = 0;
  let height = 0;
  let paused = false;
  let birdCount = DEFAULT_BIRD_COUNT;
  let simulationSpeed = 4;
  let simulationClock = performance.now();
  let duskEnabled = true;
  let duskStartedAt = 0;
  let avoidEdges = false;
  let immersiveView = true;
  let depthFrame = 0;
  const depthLayers = Array.from({ length: 8 }, () => []);
  const immersiveLayers = Array.from({ length: 14 }, () => []);
  const predator = { x: 0, y: 0, active: false };
  const camera = { yaw: 0, pitch: .48, targetYaw: 0, targetPitch: .48, dragging: false, pointerId: null, lastX: 0, lastY: 0 };
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
  const spatialDelta = (a, b, size) => avoidEdges || immersiveView ? b - a : wrappedDelta(a, b, size);
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
    if (avoidEdges || immersiveView) {
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
      const direction = immersiveView ? Math.random() * TAU : angle + Math.PI / 2 + (Math.random() - .5);
      const speed = .85 + Math.random() * .85;
      return {
        x: immersiveView ? width * (.04 + Math.random() * .92) : cx + Math.cos(angle) * radius,
        y: immersiveView ? height * (.04 + Math.random() * .92) : cy + Math.sin(angle) * radius * .55,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        ax: 0,
        ay: 0,
        fear: 0,
        bank: 0,
        z: Math.random(),
        vz: (Math.random() - .5) * .004,
        phase: Math.random() * TAU,
        depthBias: Math.random() * 2 - 1,
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
  const drawBird = (bird, projected = false) => {
    const angle = projected ? bird.viewAngle : Math.atan2(bird.vy, bird.vx);
    const perspective = projected ? bird.viewScale : .55 + bird.z * .8;
    const size = (3.25 + Math.min(Math.hypot(bird.vx, bird.vy), 3) * .65) * perspective;
    const bank = Math.max(-.8, Math.min(.8, bird.bank || 0));
    ctx.save();
    ctx.translate(projected ? bird.viewX : bird.x, projected ? bird.viewY : bird.y);
    ctx.rotate(angle);
    ctx.globalAlpha = projected ? bird.viewAlpha : .36 + bird.z * .58;
    ctx.fillStyle = "rgb(17,17,24)";
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
  const projectBird = bird => {
    const worldX = bird.x / width - .5;
    const worldUp = .18 + bird.z * .72;
    const worldForward = bird.y / height - .5;
    const cosYaw = Math.cos(camera.yaw);
    const sinYaw = Math.sin(camera.yaw);
    const cosPitch = Math.cos(camera.pitch);
    const sinPitch = Math.sin(camera.pitch);
    const yawX = cosYaw * worldX - sinYaw * worldForward;
    const yawForward = sinYaw * worldX + cosYaw * worldForward;
    const viewUp = cosPitch * worldUp - sinPitch * yawForward;
    const viewForward = sinPitch * worldUp + cosPitch * yawForward;
    if (viewForward <= .035) return false;
    const focalLength = Math.min(width, height) * .76;
    const screenX = width * .5 + yawX / viewForward * focalLength;
    const screenY = height * .5 - viewUp / viewForward * focalLength;
    const margin = 42;
    if (screenX < -margin || screenX > width + margin || screenY < -margin || screenY > height + margin) return false;
    bird.viewX = screenX;
    bird.viewY = screenY;
    bird.viewAngle = Math.atan2(bird.vy, bird.vx);
    bird.viewScale = Math.max(.32, Math.min(3.25, .19 / viewForward));
    bird.viewAlpha = Math.max(.3, Math.min(.98, 1.02 - viewForward * .62));
    bird.viewDepth = viewForward;
    return true;
  };
  const drawGroundView = () => {
    if (!immersiveView) return;
    const focalLength = Math.min(width, height) * .76;
    const horizon = height * .5 + Math.tan(camera.pitch) * focalLength;
    if (horizon < height) {
      const top = Math.max(0, horizon);
      ctx.fillStyle = "rgba(84, 101, 76, .58)";
      ctx.fillRect(0, top, width, height - top);
      ctx.fillStyle = "rgba(225, 226, 204, .42)";
      ctx.fillRect(0, Math.max(0, top - 2), width, 3);
    }
  };
  const updateMoonView = () => {
    if (!duskEnabled) return;
    const rise = Math.min(1, (performance.now() - duskStartedAt) / 100000);
    let screenX = width * .82;
    let screenY = height * (.24 - rise * .1);
    let visible = true;
    if (immersiveView) {
      const worldX = .55;
      const worldUp = .78 + rise * .12;
      const worldForward = .85;
      const moonYaw = camera.yaw * MOON_VIEW_PARALLAX;
      const moonPitch = NEUTRAL_VIEW_PITCH + (camera.pitch - NEUTRAL_VIEW_PITCH) * MOON_VIEW_PARALLAX;
      const cosYaw = Math.cos(moonYaw);
      const sinYaw = Math.sin(moonYaw);
      const cosPitch = Math.cos(moonPitch);
      const sinPitch = Math.sin(moonPitch);
      const yawX = cosYaw * worldX - sinYaw * worldForward;
      const yawForward = sinYaw * worldX + cosYaw * worldForward;
      const viewUp = cosPitch * worldUp - sinPitch * yawForward;
      const viewForward = sinPitch * worldUp + cosPitch * yawForward;
      if (viewForward <= .035) visible = false;
      else {
        const focalLength = Math.min(width, height) * .76;
        screenX = width * .5 + yawX / viewForward * focalLength;
        screenY = height * .5 - viewUp / viewForward * focalLength;
        visible = screenX > -90 && screenX < width + 90 && screenY > -90 && screenY < height + 90;
      }
    }
    risingMoon.style.left = `${screenX}px`;
    risingMoon.style.top = `${screenY}px`;
    risingMoon.style.opacity = visible ? "1" : "0";
  };
  const drawViewpointMap = () => {
    if (!immersiveView) return;
    const mapWidth = viewpointMap.width;
    const mapHeight = viewpointMap.height;
    const pad = 10;
    const plotWidth = mapWidth - pad * 2;
    const plotHeight = mapHeight - pad * 2;
    const centerX = mapWidth * .5;
    const centerY = mapHeight * .5;
    mapCtx.clearRect(0, 0, mapWidth, mapHeight);
    mapCtx.fillStyle = "rgba(204, 213, 207, .78)";
    mapCtx.fillRect(0, 0, mapWidth, mapHeight);
    mapCtx.strokeStyle = "rgba(23, 24, 32, .28)";
    mapCtx.lineWidth = 1;
    mapCtx.strokeRect(pad, pad, plotWidth, plotHeight);

    mapCtx.fillStyle = "rgba(17, 17, 24, .34)";
    const step = Math.max(1, Math.ceil(birds.length / 220));
    let centroidX = 0;
    let centroidY = 0;
    for (let i = 0; i < birds.length; i++) {
      centroidX += birds[i].x;
      centroidY += birds[i].y;
      if (i % step !== 0) continue;
      const dotX = pad + birds[i].x / width * plotWidth;
      const dotY = pad + birds[i].y / height * plotHeight;
      mapCtx.fillRect(dotX - 1, dotY - 1, 2, 2);
    }

    if (birds.length) {
      centroidX = pad + centroidX / birds.length / width * plotWidth;
      centroidY = pad + centroidY / birds.length / height * plotHeight;
      mapCtx.strokeStyle = "rgba(17, 17, 24, .62)";
      mapCtx.beginPath();
      mapCtx.arc(centroidX, centroidY, 5, 0, TAU);
      mapCtx.stroke();
    }

    const directionAngle = camera.yaw - Math.PI / 2;
    const coneRadius = mapWidth * .42;
    mapCtx.fillStyle = "rgba(158, 62, 40, .14)";
    mapCtx.strokeStyle = "rgba(158, 62, 40, .72)";
    mapCtx.beginPath();
    mapCtx.moveTo(centerX, centerY);
    mapCtx.arc(centerX, centerY, coneRadius, directionAngle - .5, directionAngle + .5);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.fillStyle = "#9e3e28";
    mapCtx.beginPath();
    mapCtx.arc(centerX, centerY, 3.2, 0, TAU);
    mapCtx.fill();
    const tiltTop = pad + 3;
    const tiltBottom = mapHeight - pad - 3;
    const tiltX = mapWidth - 5;
    const tiltRatio = (camera.pitch + .3) / 1.72;
    const tiltY = tiltBottom - Math.max(0, Math.min(1, tiltRatio)) * (tiltBottom - tiltTop);
    mapCtx.strokeStyle = "rgba(23, 24, 32, .32)";
    mapCtx.beginPath();
    mapCtx.moveTo(tiltX, tiltTop);
    mapCtx.lineTo(tiltX, tiltBottom);
    mapCtx.stroke();
    mapCtx.fillStyle = "#9e3e28";
    mapCtx.fillRect(tiltX - 3, tiltY - 1, 6, 2);
  };
  const drawBirds = () => {
    if (immersiveView) {
      immersiveLayers.forEach(layer => { layer.length = 0; });
      birds.forEach(bird => {
        if (!projectBird(bird)) return;
        const layer = Math.min(immersiveLayers.length - 1, Math.floor(bird.viewDepth / .75 * immersiveLayers.length));
        immersiveLayers[layer].push(bird);
      });
      for (let i = immersiveLayers.length - 1; i >= 0; i--) immersiveLayers[i].forEach(bird => drawBird(bird, true));
      return;
    }
    depthLayers.forEach(layer => { layer.length = 0; });
    birds.forEach(bird => {
      const layer = Math.min(depthLayers.length - 1, Math.floor(bird.z * depthLayers.length));
      depthLayers[layer].push(bird);
    });
    depthLayers.forEach(layer => layer.forEach(bird => drawBird(bird)));
  };
  const update = () => {
    const neighbourRadius = immersiveView
      ? Math.max(42, Math.min(104, 700 / Math.cbrt(birds.length)))
      : Math.max(18, Math.min(MAX_NEIGHBOUR_RADIUS, 900 / Math.sqrt(birds.length)));
    const { grid, columns, rows } = buildNeighbourGrid(neighbourRadius);
    const nextStates = new Array(birds.length);
    const step = simulationSpeed;
    simulationClock += 1000 / 60 * step;
    const now = simulationClock;
    const time = now * .001;
    const flow = formationFlow(now);
    const advanceDepth = depthFrame++ % 3 === 0;
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      const nearest = [];
      const ownColumn = Math.min(columns - 1, Math.floor(bird.x / neighbourRadius));
      const ownRow = Math.min(rows - 1, Math.floor(bird.y / neighbourRadius));
      for (let cellY = -1; cellY <= 1; cellY++) {
        for (let cellX = -1; cellX <= 1; cellX++) {
          const candidateColumn = ownColumn + cellX;
          const candidateRow = ownRow + cellY;
          if ((avoidEdges || immersiveView) && (candidateColumn < 0 || candidateColumn >= columns || candidateRow < 0 || candidateRow >= rows)) continue;
          const column = (candidateColumn + columns) % columns;
          const row = (candidateRow + rows) % rows;
          const candidates = grid[row * columns + column];
          for (const j of candidates) {
            if (i === j) continue;
            const other = birds[j];
            const dx = spatialDelta(bird.x, other.x, width);
            const dy = spatialDelta(bird.y, other.y, height);
            const dz = other.z - bird.z;
            const depthDistance = immersiveView ? dz * Math.min(width, height) : 0;
            const distSq = dx * dx + dy * dy + depthDistance * depthDistance;
            if (distSq < neighbourRadius * neighbourRadius) {
              if (nearest.length === TOPOLOGICAL_NEIGHBOURS && distSq >= nearest[nearest.length - 1].distSq) continue;
              const neighbour = { bird: other, dx, dy, dz, distSq };
              let position = nearest.length;
              while (position > 0 && nearest[position - 1].distSq > distSq) position--;
              nearest.splice(position, 0, neighbour);
              if (nearest.length > TOPOLOGICAL_NEIGHBOURS) nearest.pop();
            }
          }
        }
      }
      let alignX = 0, alignY = 0, alignZ = 0, cohesionX = 0, cohesionY = 0, cohesionZ = 0;
      let separateX = 0, separateY = 0, separateZ = 0, totalWeight = 0, neighbourFear = 0;
      const speed = Math.hypot(bird.vx, bird.vy) || 1;
      const headingX = bird.vx / speed;
      const headingY = bird.vy / speed;
      nearest.forEach(neighbour => {
        const distance = Math.sqrt(neighbour.distSq) || .01;
        const facing = (neighbour.dx * headingX + neighbour.dy * headingY) / distance;
        const depthDifference = Math.abs(bird.z - neighbour.bird.z);
        const depthWeight = 1 - Math.min(1, depthDifference) * .38;
        const weight = (facing < -.35 ? .32 : 1) * (1 - distance / neighbourRadius * .25) * depthWeight;
        alignX += neighbour.bird.vx * weight;
        alignY += neighbour.bird.vy * weight;
        alignZ += neighbour.bird.vz * weight;
        cohesionX += neighbour.dx * weight;
        cohesionY += neighbour.dy * weight;
        cohesionZ += neighbour.dz * weight;
        totalWeight += weight;
        neighbourFear = Math.max(neighbourFear, neighbour.bird.fear * (1 - distance / (neighbourRadius * 1.35)));
        const spacing = 27 - flow.compression * 14;
        if (distance < spacing && depthDifference < .42) {
          const pressure = Math.pow(1 - distance / spacing, 2);
          separateX -= neighbour.dx / distance * pressure;
          separateY -= neighbour.dy / distance * pressure;
          separateZ -= Math.sign(neighbour.dz) * pressure;
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
      const fear = Math.max(directFear, bird.fear * Math.pow(.955, step), neighbourFear * Math.pow(.92, step));
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
      if (avoidEdges || immersiveView) {
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
      const stepResponse = 1 - Math.pow(1 - response, step);
      const smoothed = limit(
        bird.ax * (1 - stepResponse) + steering.x * stepResponse,
        bird.ay * (1 - stepResponse) + steering.y * stepResponse,
        .065 + fear * .15 + flow.intensity * .07
      );
      let vx = bird.vx + smoothed.x * step;
      let vy = bird.vy + smoothed.y * step;
      const velocity = limit(vx, vy, 3.9);
      const nextSpeed = Math.hypot(velocity.x, velocity.y);
      vx = nextSpeed < .9 ? velocity.x / (nextSpeed || 1) * .9 : velocity.x;
      vy = nextSpeed < .9 ? velocity.y / (nextSpeed || 1) * .9 : velocity.y;
      const newSpeed = Math.hypot(vx, vy) || 1;
      const bank = bird.bank * Math.pow(.78, step) + (headingX * vy / newSpeed - headingY * vx / newSpeed) * 3.4;
      let z = bird.z;
      let vz = bird.vz;
      if (immersiveView) {
        let depthAcceleration = 0;
        if (totalWeight) {
          depthAcceleration += (alignZ / totalWeight - bird.vz) * .04;
          depthAcceleration += cohesionZ / totalWeight * .0022;
          depthAcceleration += separateZ * .0018;
        }
        if (bird.z < .12) depthAcceleration += (1 - bird.z / .12) * .0011;
        if (bird.z > .88) depthAcceleration -= (1 - (1 - bird.z) / .12) * .0011;
        if (flow.intensity) {
          depthAcceleration += Math.sin(bird.x * .016 + bird.y * .011 - time * 2.4 + flow.phase) * flow.ribbon * .0007;
        }
        vz = Math.max(-.008, Math.min(.008, bird.vz * Math.pow(.982, step) + depthAcceleration * step));
      } else if (advanceDepth) {
        let depthTarget = .5 + Math.sin(time * .31 + bird.phase + bird.x * .0015) * .34;
        if (flow.intensity) {
          const depthWave = Math.sin((bird.x * flow.flowX + bird.y * flow.flowY) * .018 - time * 2.9 + flow.phase);
          depthTarget += depthWave * flow.ribbon * .24;
        }
        depthTarget += bird.depthBias * fear * .14;
        depthTarget = Math.max(.04, Math.min(.96, depthTarget));
        vz = bird.vz * Math.pow(.885, step) + (depthTarget - bird.z) * .0135 * step;
        vz = Math.max(-.013, Math.min(.013, vz));
      }
      z = bird.z + vz * step;
      if (z < 0) { z = 0; vz = Math.abs(vz) * .65; }
      if (z > 1) { z = 1; vz = -Math.abs(vz) * .65; }
      let x;
      let y;
      if (avoidEdges || immersiveView) {
        x = bird.x + vx * step;
        y = bird.y + vy * step;
        if (x < 1) { x = 1; vx = Math.abs(vx) * .55; }
        if (x > width - 1) { x = width - 1; vx = -Math.abs(vx) * .55; }
        if (y < 1) { y = 1; vy = Math.abs(vy) * .55; }
        if (y > height - 1) { y = height - 1; vy = -Math.abs(vy) * .55; }
      } else {
        x = (bird.x + vx * step + width) % width;
        y = (bird.y + vy * step + height) % height;
      }
      nextStates[i] = { x, y, vx, vy, ax: smoothed.x, ay: smoothed.y, fear, bank, z, vz };
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
    if (immersiveView) {
      camera.yaw += (camera.targetYaw - camera.yaw) * .18;
      camera.pitch += (camera.targetPitch - camera.pitch) * .18;
    }
    drawGroundView();
    updateMoonView();
    if (!paused) update();
    drawBirds();
    drawViewpointMap();
    if (predator.active && !immersiveView) drawPredator();
    requestAnimationFrame(frame);
  };
  const movePredator = event => {
    const box = canvas.getBoundingClientRect();
    predator.x = event.clientX - box.left;
    predator.y = event.clientY - box.top;
    predator.active = true;
    invitation.classList.add("hidden");
  };
  const panCamera = event => {
    if (!camera.dragging) return;
    const dx = event.clientX - camera.lastX;
    const dy = event.clientY - camera.lastY;
    camera.targetYaw -= dx * .006;
    camera.targetPitch = Math.max(-.3, Math.min(1.42, camera.targetPitch - dy * .005));
    camera.lastX = event.clientX;
    camera.lastY = event.clientY;
    invitation.classList.add("hidden");
  };
  canvas.addEventListener("pointermove", event => immersiveView ? panCamera(event) : movePredator(event));
  canvas.addEventListener("pointerdown", event => {
    canvas.setPointerCapture(event.pointerId);
    if (canvas.focus) canvas.focus({ preventScroll: true });
    if (immersiveView) {
      camera.dragging = true;
      camera.pointerId = event.pointerId;
      camera.lastX = event.clientX;
      camera.lastY = event.clientY;
      predator.active = false;
    } else movePredator(event);
  });
  const stopPointer = event => {
    if (camera.pointerId === null || !event || event.pointerId === camera.pointerId) {
      camera.dragging = false;
      camera.pointerId = null;
    }
    predator.active = false;
  };
  canvas.addEventListener("pointerup", stopPointer);
  canvas.addEventListener("pointercancel", stopPointer);
  canvas.addEventListener("pointerleave", event => { if (!camera.dragging) stopPointer(event); });
  canvas.addEventListener("keydown", event => {
    if (!immersiveView || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") camera.targetYaw += .12;
    if (event.key === "ArrowRight") camera.targetYaw -= .12;
    if (event.key === "ArrowUp") camera.targetPitch = Math.min(1.42, camera.targetPitch + .09);
    if (event.key === "ArrowDown") camera.targetPitch = Math.max(-.3, camera.targetPitch - .09);
    invitation.classList.add("hidden");
  });
  pauseButton.addEventListener("click", () => { paused = !paused; pauseButton.textContent = paused ? "Resume" : "Pause"; });
  gatherButton.addEventListener("click", seedBirds);
  birdCountInput.addEventListener("change", () => {
    const requested = Number.parseInt(birdCountInput.value, 10);
    birdCount = Number.isFinite(requested) ? Math.min(MAX_BIRD_COUNT, Math.max(MIN_BIRD_COUNT, requested)) : DEFAULT_BIRD_COUNT;
    birdCountInput.value = String(birdCount);
    seedBirds();
  });
  birdCountInput.addEventListener("keydown", event => { if (event.key === "Enter") birdCountInput.blur(); });
  speedInput.addEventListener("input", () => {
    const requested = Number.parseInt(speedInput.value, 10);
    simulationSpeed = Number.isFinite(requested) ? Math.min(5, Math.max(1, requested)) : 1;
    speedInput.value = String(simulationSpeed);
    speedOutput.textContent = `${simulationSpeed}×`;
  });
  const updateDescription = () => {
    if (immersiveView) {
      edgeDescription.textContent = "Standing beneath the flock · drag, swipe, or use arrow keys to look around";
      return;
    }
    edgeDescription.textContent = avoidEdges
      ? "Soft boundary active · the flock will turn before the edge"
      : "There are no edges here · every horizon leads back to the sky";
  };
  edgeModeInput.addEventListener("change", () => {
    avoidEdges = edgeModeInput.checked;
    updateDescription();
  });
  cloudToggle.addEventListener("change", () => {
    cloudLayer.classList.toggle("clouds-hidden", !cloudToggle.checked);
  });
  duskToggle.addEventListener("change", () => {
    duskEnabled = duskToggle.checked;
    duskStartedAt = performance.now();
    gameShell.classList.toggle("dusk-mode", duskEnabled);
    updateMoonView();
  });
  viewModeInput.addEventListener("change", () => {
    immersiveView = viewModeInput.checked;
    predator.active = false;
    camera.dragging = false;
    camera.pointerId = null;
    camera.yaw = 0;
    camera.targetYaw = 0;
    camera.pitch = .48;
    camera.targetPitch = .48;
    gameShell.classList.toggle("immersive-mode", immersiveView);
    immersiveHud.setAttribute("aria-hidden", String(!immersiveView));
    invitationText.textContent = immersiveView ? "Look around from beneath the flock" : "Move here to enter the flock";
    modeIntroduction.textContent = immersiveView ? "Stand beneath the murmuration. Follow it across the sky." : "Move the bird of prey. Watch the flock think as one.";
    invitation.classList.remove("hidden");
    seedBirds();
    updateDescription();
  });
  window.addEventListener("resize", resize);
  duskStartedAt = performance.now();
  cloudLayer.classList.toggle("clouds-hidden", !cloudToggle.checked);
  gameShell.classList.toggle("dusk-mode", duskEnabled);
  gameShell.classList.toggle("immersive-mode", immersiveView);
  immersiveHud.setAttribute("aria-hidden", String(!immersiveView));
  invitationText.textContent = "Look around from beneath the flock";
  modeIntroduction.textContent = "Stand beneath the murmuration. Follow it across the sky.";
  updateDescription();
  resize();
  requestAnimationFrame(frame);
})();
