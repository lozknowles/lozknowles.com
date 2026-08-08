(() => {
  "use strict";

  /*
   * FLIGHT MODEL
   * -----------
   * Positions are stored in canvas coordinates plus a normalised altitude z.
   * Velocities are integrated at a nominal 60 simulation steps per second and
   * converted from real metres per second across the half-mile reference width.
   * The user speed control advances simulation time; it does not change the
   * biological cruise and burst limits below.
   *
   * Each update is two-phase: every bird reads the same previous flock state,
   * writes a proposed next state, and only then are all birds committed. This
   * prevents array order from influencing the flock.
   */
  const DEFAULT_BIRD_COUNT = 2500;
  const MIN_BIRD_COUNT = 10;
  const MAX_BIRD_COUNT = 10000;
  const MAX_NEIGHBOUR_RADIUS = 88;
  const TOPOLOGICAL_NEIGHBOURS = 7;
  const EDGE_MARGIN = 96;
  const AIRSPACE_METERS = 804.672;
  const SIMULATION_HZ = 60;
  const REFERENCE_CRUISE_MPS = 12;
  const MIN_CRUISE_MPS = 10;
  const MAX_CRUISE_MPS = 14;
  const MIN_FLIGHT_MPS = 8;
  const MAX_FLIGHT_MPS = 22;
  const MAX_VERTICAL_MPS = 6;
  const BASE_REACTION_SECONDS = .1;
  const LEGACY_CRUISE_SPEED = 1.575;
  const GROUND_DEPTH_MULTIPLIER = 2;
  const DENSITY_TRACK_INTERVAL_MS = 140;
  const MANUAL_LOOK_PAUSE_MS = 1400;
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
  const autoTrackInput = document.getElementById("auto-track");
  const autoTrackStatus = document.getElementById("auto-track-status");
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
  let lastFrameAt = null;
  let duskEnabled = true;
  let duskStartedAt = 0;
  let avoidEdges = false;
  let immersiveView = true;
  let autoTrackEnabled = autoTrackInput.checked;
  let depthFrame = 0;
  const depthLayers = Array.from({ length: 8 }, () => []);
  const immersiveLayers = Array.from({ length: 20 }, () => []);
  const predator = { x: 0, y: 0, active: false };
  const camera = {
    yaw: 0, pitch: .48, targetYaw: 0, targetPitch: .48,
    dragging: false, pointerId: null, lastX: 0, lastY: 0,
    manualUntil: 0, lastDensityTrackAt: 0,
    denseX: .5, denseY: .5, denseZ: .5
  };
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
  const metresPerSecondToPixelsPerStep = metresPerSecond => metresPerSecond * width / AIRSPACE_METERS / SIMULATION_HZ;
  const metresPerSecondToWorldStep = metresPerSecond => metresPerSecond / AIRSPACE_METERS / SIMULATION_HZ;
  const dynamicsScale = () => metresPerSecondToPixelsPerStep(REFERENCE_CRUISE_MPS) / LEGACY_CRUISE_SPEED;

  /*
   * A formation is a temporary flock-wide field layered over local boid rules.
   * It first compresses birds toward a moving centre, then blends longitudinal,
   * tangential and radial sine waves to form knots, ribbons and vortices.
   */
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
    const travelProgress = Math.max(0, (progress - .28) / .72);
    const travelMeters = 18 * formation.duration * .001 * .72;
    const travel = travelProgress * travelMeters / AIRSPACE_METERS * Math.min(width, height);
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

  /* Seed individual cruise preferences and headings; no two birds are identical. */
  const seedBirds = () => {
    const cx = width * .5;
    const cy = height * .48;
    birds = Array.from({ length: birdCount }, (_, i) => {
      const angle = i / birdCount * TAU + Math.random() * .5;
      const radius = Math.sqrt(Math.random()) * Math.min(width, height) * .26;
      const direction = immersiveView ? Math.random() * TAU : angle + Math.PI / 2 + (Math.random() - .5);
      const preferredSpeedMps = MIN_CRUISE_MPS + Math.random() * (MAX_CRUISE_MPS - MIN_CRUISE_MPS);
      const speed = metresPerSecondToPixelsPerStep(preferredSpeedMps * (.85 + Math.random() * .3));
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
        vz: metresPerSecondToWorldStep((Math.random() - .5) * 4),
        phase: Math.random() * TAU,
        depthBias: Math.random() * 2 - 1,
        preferredSpeedMps
      };
    });
  };

  /*
   * Spatial hashing limits neighbour searches to the surrounding 3×3 cells.
   * Within those candidates, update() retains the seven closest influential
   * birds—the topological rule observed in real starling flocks.
   */
  const buildNeighbourGrid = neighbourRadius => {
    const columns = Math.max(1, Math.ceil(width / neighbourRadius));
    const rows = Math.max(1, Math.ceil(height / neighbourRadius));
    // Ground view also hashes altitude. This prevents a 10,000-bird flock from
    // testing every vertically distant bird that happens to share a screen cell.
    const depthCell = immersiveView ? neighbourRadius / Math.min(width, height) : 1;
    const depthSlices = immersiveView ? Math.max(1, Math.ceil(1 / depthCell)) : 1;
    const grid = Array.from({ length: columns * rows * depthSlices }, () => []);
    birds.forEach((bird, index) => {
      const column = Math.min(columns - 1, Math.floor(bird.x / neighbourRadius));
      const row = Math.min(rows - 1, Math.floor(bird.y / neighbourRadius));
      const depth = Math.min(depthSlices - 1, Math.floor(bird.z / depthCell));
      grid[(depth * rows + row) * columns + column].push(index);
    });
    return { grid, columns, rows, depthCell, depthSlices };
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
  /*
   * Ground view projects a world-space bird through camera yaw and pitch.
   * Front-to-back coordinates are deliberately doubled to give the flock twice
   * its previous visual depth without changing its calibrated flight velocity.
   */
  const projectBird = bird => {
    const worldX = bird.x / width - .5;
    const worldUp = .18 + bird.z * .72;
    const worldForward = (bird.y / height - .5) * GROUND_DEPTH_MULTIPLIER;
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
  /*
   * Human observers naturally follow the most visually active, compact part of
   * a murmuration. A coarse 10×10×6 density field finds the busiest local 3D
   * neighbourhood, then aims the camera at its weighted centroid. Target angles
   * and head angles are both eased, avoiding mechanical snaps. A manual drag,
   * swipe or arrow-key look temporarily takes priority before tracking resumes.
   */
  const trackDensestFlock = now => {
    if (!immersiveView || !autoTrackEnabled || camera.dragging || now < camera.manualUntil || !birds.length || now - camera.lastDensityTrackAt < DENSITY_TRACK_INTERVAL_MS) return;
    camera.lastDensityTrackAt = now;
    const binsX = 10;
    const binsY = 10;
    const binsZ = 6;
    const layerSize = binsX * binsY;
    const cellCount = layerSize * binsZ;
    const counts = new Uint16Array(cellCount);
    const sumsX = new Float64Array(cellCount);
    const sumsY = new Float64Array(cellCount);
    const sumsZ = new Float64Array(cellCount);
    birds.forEach(bird => {
      const cellX = Math.min(binsX - 1, Math.floor(bird.x / width * binsX));
      const cellY = Math.min(binsY - 1, Math.floor(bird.y / height * binsY));
      const cellZ = Math.min(binsZ - 1, Math.floor(bird.z * binsZ));
      const index = cellZ * layerSize + cellY * binsX + cellX;
      counts[index]++;
      sumsX[index] += bird.x;
      sumsY[index] += bird.y;
      sumsZ[index] += bird.z;
    });
    let best = { score: -1, x: 0, y: 0, z: 0, count: 0 };
    for (let z = 0; z < binsZ; z++) {
      for (let y = 0; y < binsY; y++) {
        for (let x = 0; x < binsX; x++) {
          let score = 0, sumX = 0, sumY = 0, sumZ = 0, count = 0;
          for (let dz = -1; dz <= 1; dz++) {
            const nz = z + dz;
            if (nz < 0 || nz >= binsZ) continue;
            for (let dy = -1; dy <= 1; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= binsY) continue;
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= binsX) continue;
                const index = nz * layerSize + ny * binsX + nx;
                const proximityWeight = dx === 0 && dy === 0 && dz === 0 ? 1 : .55;
                score += counts[index] * proximityWeight;
                count += counts[index];
                sumX += sumsX[index];
                sumY += sumsY[index];
                sumZ += sumsZ[index];
              }
            }
          }
          if (score > best.score && count) best = { score, x: sumX / count, y: sumY / count, z: sumZ / count, count };
        }
      }
    }
    if (!best.count) return;
    camera.denseX = best.x / width;
    camera.denseY = best.y / height;
    camera.denseZ = best.z;
    const worldX = camera.denseX - .5;
    const worldForward = (camera.denseY - .5) * GROUND_DEPTH_MULTIPLIER;
    const worldUp = .18 + camera.denseZ * .72;
    const desiredYaw = Math.atan2(worldX, worldForward);
    const yawDelta = Math.atan2(Math.sin(desiredYaw - camera.targetYaw), Math.cos(desiredYaw - camera.targetYaw));
    const desiredPitch = Math.max(-.3, Math.min(1.42, Math.atan2(worldUp, Math.hypot(worldX, worldForward))));
    camera.targetYaw += yawDelta * .24;
    camera.targetPitch += (desiredPitch - camera.targetPitch) * .2;
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

    // Red ring: the densest 3D neighbourhood currently being tracked.
    if (autoTrackEnabled) {
      const denseMapX = pad + camera.denseX * plotWidth;
      const denseMapY = pad + camera.denseY * plotHeight;
      mapCtx.strokeStyle = "rgba(158, 62, 40, .9)";
      mapCtx.lineWidth = 1.5;
      mapCtx.beginPath();
      mapCtx.arc(denseMapX, denseMapY, 6.5, 0, TAU);
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
        const layer = Math.min(immersiveLayers.length - 1, Math.floor(bird.viewDepth / (GROUND_DEPTH_MULTIPLIER * .75) * immersiveLayers.length));
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
  /*
   * One flock update:
   *  1. find seven nearby neighbours;
   *  2. combine alignment, cohesion and collision separation;
   *  3. propagate predator fear and optional formation pressure;
   *  4. apply bounded steering, 100 ms response and real-world speed limits;
   *  5. integrate horizontal and vertical positions into nextStates.
   */
  const update = step => {
    const neighbourRadius = immersiveView
      ? Math.max(42, Math.min(104, 700 / Math.cbrt(birds.length)))
      : Math.max(18, Math.min(MAX_NEIGHBOUR_RADIUS, 900 / Math.sqrt(birds.length)));
    const { grid, columns, rows, depthCell, depthSlices } = buildNeighbourGrid(neighbourRadius);
    const nextStates = new Array(birds.length);
    simulationClock += 1000 / 60 * step;
    const now = simulationClock;
    const time = now * .001;
    const flow = formationFlow(now);
    const motionScale = dynamicsScale();
    const depthScale = metresPerSecondToWorldStep(MAX_VERTICAL_MPS) / .008;
    const advanceDepth = depthFrame++ % 3 === 0;
    for (let i = 0; i < birds.length; i++) {
      const bird = birds[i];
      const nearest = [];
      const ownColumn = Math.min(columns - 1, Math.floor(bird.x / neighbourRadius));
      const ownRow = Math.min(rows - 1, Math.floor(bird.y / neighbourRadius));
      const ownDepth = Math.min(depthSlices - 1, Math.floor(bird.z / depthCell));
      // Gather, sort and retain only the seven nearest candidates.
      const depthStart = immersiveView ? -1 : 0;
      const depthEnd = immersiveView ? 1 : 0;
      for (let cellDepth = depthStart; cellDepth <= depthEnd; cellDepth++) {
        const candidateDepth = ownDepth + cellDepth;
        if (candidateDepth < 0 || candidateDepth >= depthSlices) continue;
        for (let cellY = -1; cellY <= 1; cellY++) {
          for (let cellX = -1; cellX <= 1; cellX++) {
            const candidateColumn = ownColumn + cellX;
            const candidateRow = ownRow + cellY;
            if ((avoidEdges || immersiveView) && (candidateColumn < 0 || candidateColumn >= columns || candidateRow < 0 || candidateRow >= rows)) continue;
            const column = (candidateColumn + columns) % columns;
            const row = (candidateRow + rows) % rows;
            const candidates = grid[(candidateDepth * rows + row) * columns + column];
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
      }
      let alignX = 0, alignY = 0, alignZ = 0, cohesionX = 0, cohesionY = 0, cohesionZ = 0;
      let separateX = 0, separateY = 0, separateZ = 0, totalWeight = 0, neighbourFear = 0;
      const speed = Math.hypot(bird.vx, bird.vy) || 1;
      const headingX = bird.vx / speed;
      const headingY = bird.vy / speed;
      // Local boid forces are weighted by distance, field of view and altitude.
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
        const align = limit(alignX / totalWeight, alignY / totalWeight, metresPerSecondToPixelsPerStep(MAX_FLIGHT_MPS));
        const cohesion = limit(cohesionX / totalWeight, cohesionY / totalWeight, 1.3);
        const compression = 1 + flow.compression * 4.5;
        const separation = .19 * (1 - flow.compression * .7);
        ax += (align.x - bird.vx) * .042 + cohesion.x * .009 * compression * motionScale + separateX * separation * motionScale;
        ay += (align.y - bird.vy) * .042 + cohesion.y * .009 * compression * motionScale + separateY * separation * motionScale;
      }
      // Fear starts at the predator and decays as it propagates through neighbours.
      let directFear = 0;
      if (predator.active) {
        const dx = spatialDelta(predator.x, bird.x, width);
        const dy = spatialDelta(predator.y, bird.y, height);
        const distance = Math.hypot(dx, dy);
        if (distance < 175 && distance > .1) {
          directFear = Math.pow(1 - distance / 175, 2);
          const escape = (.18 + directFear * .64) * motionScale;
          ax += dx / distance * escape; ay += dy / distance * escape;
        }
      }
      const fear = Math.max(directFear, bird.fear * Math.pow(.955, step), neighbourFear * Math.pow(.92, step));
      // Formation pressure is additive, so local collision avoidance still wins.
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
          ax += (inwardX * inwardPull + tangentX * .045 * flow.ribbon + ribbonX * .034 * flow.ribbon) * influence * motionScale;
          ay += (inwardY * inwardPull + tangentY * .045 * flow.ribbon + ribbonY * .034 * flow.ribbon) * influence * motionScale;
        }
      }
      if (avoidEdges || immersiveView) {
        const horizontalMargin = Math.min(EDGE_MARGIN, width * .25);
        const verticalMargin = Math.min(EDGE_MARGIN, height * .25);
        if (bird.x < horizontalMargin) ax += (1 - bird.x / horizontalMargin) * .18 * motionScale;
        if (bird.x > width - horizontalMargin) ax -= (1 - (width - bird.x) / horizontalMargin) * .18 * motionScale;
        if (bird.y < verticalMargin) ay += (1 - bird.y / verticalMargin) * .18 * motionScale;
        if (bird.y > height - verticalMargin) ay -= (1 - (height - bird.y) / verticalMargin) * .18 * motionScale;
      }
      const wander = Math.sin(time * .72 + bird.phase) * .0045 * motionScale;
      ax += -headingY * wander - bird.vy * .0012;
      ay += headingX * wander + bird.vx * .0012;
      // Cruise, fear and formation components resolve to a biological m/s target.
      const desiredSpeedMps = Math.min(MAX_FLIGHT_MPS, bird.preferredSpeedMps + fear * 6 + flow.intensity * 4 + Math.sin(time * .38 + bird.phase * .7) * .6);
      const desiredSpeed = metresPerSecondToPixelsPerStep(desiredSpeedMps);
      ax += headingX * (desiredSpeed - speed) * .025;
      ay += headingY * (desiredSpeed - speed) * .025;
      const steering = limit(ax, ay, (.075 + fear * .16 + flow.intensity * .08) * motionScale);
      const response = Math.min(.95, 1 - Math.exp(-1 / (SIMULATION_HZ * BASE_REACTION_SECONDS)) + fear * .32 + flow.intensity * .12);
      const stepResponse = 1 - Math.pow(1 - response, step);
      const smoothed = limit(
        bird.ax * (1 - stepResponse) + steering.x * stepResponse,
        bird.ay * (1 - stepResponse) + steering.y * stepResponse,
        (.065 + fear * .15 + flow.intensity * .07) * motionScale
      );
      let vx = bird.vx + smoothed.x * step;
      let vy = bird.vy + smoothed.y * step;
      const velocity = limit(vx, vy, metresPerSecondToPixelsPerStep(MAX_FLIGHT_MPS));
      const nextSpeed = Math.hypot(velocity.x, velocity.y);
      const minimumSpeed = metresPerSecondToPixelsPerStep(MIN_FLIGHT_MPS);
      vx = nextSpeed < minimumSpeed ? velocity.x / (nextSpeed || 1) * minimumSpeed : velocity.x;
      vy = nextSpeed < minimumSpeed ? velocity.y / (nextSpeed || 1) * minimumSpeed : velocity.y;
      const newSpeed = Math.hypot(vx, vy) || 1;
      const bank = bird.bank * Math.pow(.78, step) + (headingX * vy / newSpeed - headingY * vx / newSpeed) * 3.4;
      let z = bird.z;
      let vz = bird.vz;
      if (immersiveView) {
        let depthAcceleration = 0;
        if (totalWeight) {
          depthAcceleration += (alignZ / totalWeight - bird.vz) * .04;
          depthAcceleration += cohesionZ / totalWeight * .0022 * depthScale;
          depthAcceleration += separateZ * .0018 * depthScale;
        }
        if (bird.z < .12) depthAcceleration += (1 - bird.z / .12) * .0011 * depthScale;
        if (bird.z > .88) depthAcceleration -= (1 - (1 - bird.z) / .12) * .0011 * depthScale;
        if (flow.intensity) {
          depthAcceleration += Math.sin(bird.x * .016 + bird.y * .011 - time * 2.4 + flow.phase) * flow.ribbon * .0007 * depthScale;
        }
        const maximumVerticalStep = metresPerSecondToWorldStep(MAX_VERTICAL_MPS);
        vz = Math.max(-maximumVerticalStep, Math.min(maximumVerticalStep, bird.vz * Math.pow(.982, step) + depthAcceleration * step));
      } else if (advanceDepth) {
        let depthTarget = .5 + Math.sin(time * .31 + bird.phase + bird.x * .0015) * .34;
        if (flow.intensity) {
          const depthWave = Math.sin((bird.x * flow.flowX + bird.y * flow.flowY) * .018 - time * 2.9 + flow.phase);
          depthTarget += depthWave * flow.ribbon * .24;
        }
        depthTarget += bird.depthBias * fear * .14;
        depthTarget = Math.max(.04, Math.min(.96, depthTarget));
        vz = bird.vz * Math.pow(.885, step) + (depthTarget - bird.z) * .0135 * depthScale * step;
        const maximumVerticalStep = metresPerSecondToWorldStep(MAX_VERTICAL_MPS);
        vz = Math.max(-maximumVerticalStep, Math.min(maximumVerticalStep, vz));
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
    // Commit simultaneously so earlier array entries never influence later ones.
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
  /* requestAnimationFrame timestamps make motion refresh-rate independent. */
  const frame = frameAt => {
    const renderedAt = Number.isFinite(frameAt) ? frameAt : performance.now();
    const elapsedFrames = lastFrameAt === null ? 1 : Math.max(.25, Math.min(3, (renderedAt - lastFrameAt) * SIMULATION_HZ / 1000));
    lastFrameAt = renderedAt;
    ctx.clearRect(0, 0, width, height);
    if (immersiveView) {
      trackDensestFlock(performance.now());
      camera.yaw += (camera.targetYaw - camera.yaw) * .18;
      camera.pitch += (camera.targetPitch - camera.pitch) * .18;
    }
    drawGroundView();
    updateMoonView();
    if (!paused) update(simulationSpeed * elapsedFrames);
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
    camera.manualUntil = performance.now() + MANUAL_LOOK_PAUSE_MS;
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
      camera.manualUntil = performance.now() + MANUAL_LOOK_PAUSE_MS;
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
    camera.manualUntil = performance.now() + MANUAL_LOOK_PAUSE_MS;
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
      edgeDescription.textContent = autoTrackEnabled
        ? "Standing beneath the flock · following its densest movement"
        : "Standing beneath the flock · manual drag, swipe, or arrow-key view";
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
  autoTrackInput.addEventListener("change", () => {
    autoTrackEnabled = autoTrackInput.checked;
    camera.manualUntil = 0;
    camera.lastDensityTrackAt = 0;
    autoTrackStatus.textContent = autoTrackEnabled
      ? "Auto-tracking the densest flock · drag, swipe, or use arrow keys to look away"
      : "Manual view · drag, swipe, or use arrow keys to look around";
    updateDescription();
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
    camera.manualUntil = 0;
    camera.lastDensityTrackAt = 0;
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
