// The public arcade's extra chapter shares the player's clock, including seeks.
export const CENTIPEDE_START = 116.6;
const SPEED = 64;
const COIL_SPEED = 44;
const SPACING = 6;
const SEGMENTS = 56;
const NS = 'http://www.w3.org/2000/svg';
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const rampY = (level, x) => 200 - level * 30 + (level % 2 ? 1 : -1) * (x - 160) / 30.5;

// Distance along one continuous trail keeps every new segment behind the head.
const trail = [];
const rows = [];
let length = 0;
function point(x, y, depth = 1) {
  const last = trail.at(-1);
  if (last) length += Math.hypot(x - last.x, y - last.y);
  trail.push({ x, y, depth, distance: length });
}
point(-8, rampY(0, -8) - 3);
for (let level = 0; level < 6; level++) {
  const from = level % 2 ? 282 : 38;
  const to = level % 2 ? 38 : 282;
  point(from, rampY(level, from) - 3);
  const start = length;
  point(to, rampY(level, to) - 3);
  rows.push({ level, from, to, start, end: length });
  if (level < 5) {
    const y1 = rampY(level, to) - 3;
    const y2 = rampY(level + 1, to) - 3;
    for (let step = 1; step <= 24; step++) {
      const u = step / 24;
      point(to + (to > 160 ? 17 : -17) * Math.sin(Math.PI * u), y1 + (y2 - y1) * u);
    }
  }
}
point(26, 47);
const coilDistance = length;
for (let step = 1; step <= 300; step++) {
  const u = step / 300;
  const angle = Math.PI + Math.PI * 7.5 * u;
  point(50 + 24 * Math.cos(angle), 47 - 18 * u + 3 * Math.sin(angle), Math.sin(angle));
}
export const COIL_START = CENTIPEDE_START + coilDistance / SPEED;
export const COIL_FINISH = COIL_START + (length - coilDistance) / COIL_SPEED;
export const ARCADE_DURATION = Math.ceil(COIL_FINISH + 6);

function sample(distance) {
  distance = clamp(distance, 0, length);
  let low = 1;
  let high = trail.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (trail[middle].distance < distance) low = middle + 1;
    else high = middle;
  }
  const a = trail[low - 1];
  const b = trail[low];
  const u = (distance - a.distance) / (b.distance - a.distance || 1);
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    depth: a.depth + (b.depth - a.depth) * u,
    angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI,
  };
}

export function centipedeState(time) {
  const distance = time < COIL_START
    ? Math.max(0, time - CENTIPEDE_START) * SPEED
    : Math.min(length, coilDistance + (time - COIL_START) * COIL_SPEED);
  return {
    visible: time >= CENTIPEDE_START,
    distance,
    count: Math.min(SEGMENTS, 10 + Math.floor(distance / 29)),
    phase: time < CENTIPEDE_START ? 'waiting' : time < COIL_START ? 'eating' : time < COIL_FINISH ? 'wrapping' : 'wrapped',
    head: sample(distance),
    rows: rows.map(row => ({ ...row, eaten: clamp((distance - row.start) / (row.end - row.start)) })),
  };
}

function svg(tag, attributes = {}, parent) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  parent?.append(element);
  return element;
}

export function createCentipede(scene) {
  const web = scene.querySelector('.a51-tempest-structure');
  const actors = scene.querySelector('.arcade-kong-actors svg');
  const kong = actors?.querySelector('.a51-kong-presence');
  if (!web || !kong) throw new Error('The arcade finale is incomplete.');
  const defs = svg('defs', {}, web.ownerSVGElement);
  const platforms = rows.map(row => {
    const clip = svg('clipPath', { id: `centipede-row-${row.level}`, clipPathUnits: 'userSpaceOnUse' }, defs);
    const rect = svg('rect', { x: -1000, y: -1000, width: 2320, height: 2224 }, clip);
    const group = svg('g', { 'clip-path': `url(#centipede-row-${row.level})`, 'data-platform': row.level }, web);
    for (let lane = 0; lane < 16; lane++) group.append(web.querySelector(`.a51-web-beam-${row.level}-${lane}`));
    return { group, rect };
  });
  const ladders = rows.slice(0, 5).map(row => {
    const original = scene.querySelector(`.a51-kong-ladder-${row.level}`).parentElement;
    const group = svg('g', { 'data-falling-ladder': row.level });
    original.before(group);
    group.append(original);
    const x = row.level % 2 ? 50 : 270;
    return {
      group, x, y: rampY(row.level + 1, x),
      fallAt: CENTIPEDE_START + (row.start + Math.abs(x - row.from)) / SPEED,
      direction: row.level % 2 ? -1 : 1,
    };
  });
  const behind = svg('g', { class: 'centipede-body centipede-behind' });
  kong.before(behind);
  const ahead = svg('g', { class: 'centipede-body centipede-ahead' }, actors);
  behind.style.display = ahead.style.display = 'none';
  const segments = Array.from({ length: SEGMENTS }, (_, index) => {
    const group = svg('g', { 'data-centipede-segment': index }, ahead);
    const feet = svg('path', { fill: 'none', stroke: '#ffe66e', 'stroke-width': .85 }, group);
    svg('path', { d: 'M-3 -2H-2V-3H2V-2H3V2H2V3H-2V2H-3Z', fill: index ? '#81e84d' : '#ff684d', stroke: '#173a27', 'stroke-width': .7 }, group);
    svg('path', { d: 'M-2 -2H1V-1H-2ZM-2 1H0V2H-2Z', fill: index ? '#dcff84' : '#ffdf65' }, group);
    if (!index) {
      svg('path', { d: 'M1 -2H3V-1H1ZM1 1H3V2H1Z', fill: '#fff6c2' }, group);
      svg('path', { d: 'M2 -2H3V-1H2ZM2 1H3V2H2Z', fill: '#101a15' }, group);
    }
    return { group, feet };
  });
  const crumbs = Array.from({ length: 36 }, () => svg('rect', { width: 1.1, height: 1.1, fill: '#ff89b0' }, ahead));
  let active = false;
  scene.dataset.centipede = 'waiting';
  scene.dataset.centipedeSegments = '0';

  return function render(time) {
    if (time < CENTIPEDE_START && !active) return;
    const state = centipedeState(time);
    // Rewinding restores every original girder, ladder and Kong animation.
    if (!state.visible && !active) return;
    active = state.visible;
    scene.dataset.centipede = state.phase;
    scene.dataset.centipedeSegments = state.visible ? state.count : 0;
    scene.classList.toggle('centipede-caught', time >= COIL_START);
    behind.style.display = ahead.style.display = state.visible ? '' : 'none';
    state.rows.forEach((row, index) => {
      const { group, rect } = platforms[index];
      group.dataset.eaten = row.eaten.toFixed(3);
      const mouth = row.from + (row.to - row.from) * row.eaten;
      const x = row.eaten === 0 ? -1000 : row.to > row.from ? mouth : -1000;
      const width = row.eaten === 0 ? 2320 : row.eaten === 1 ? 0 : row.to > row.from ? 1320 - x : mouth + 1000;
      rect.setAttribute('x', x);
      rect.setAttribute('width', width);
    });
    ladders.forEach(ladder => {
      const age = Math.max(0, time - ladder.fallAt);
      const fall = Math.min(age, 2);
      ladder.group.setAttribute('transform', `translate(${ladder.direction * 13 * fall} ${55 * fall * fall}) rotate(${ladder.direction * 110 * fall} ${ladder.x} ${ladder.y})`);
      ladder.group.setAttribute('opacity', 1 - clamp((age - .65) / .8));
      ladder.group.dataset.fallen = String(age > 0);
    });
    if (!state.visible) return;
    for (let index = SEGMENTS - 1; index >= 0; index--) {
      const { group, feet } = segments[index];
      const distance = state.distance - index * SPACING;
      group.style.display = index < state.count && distance >= 0 ? '' : 'none';
      if (index >= state.count || distance < 0) continue;
      const pose = sample(distance);
      const parent = pose.depth < 0 ? behind : ahead;
      if (group.parentElement !== parent) parent.append(group);
      group.setAttribute('transform', `translate(${pose.x.toFixed(3)} ${pose.y.toFixed(3)}) rotate(${pose.angle.toFixed(2)})`);
      const step = Math.floor(time * 13 + index) % 2 ? 1 : -1;
      feet.setAttribute('d', `M-2 -2L${-2 + step} -4H${step}M1 -2L${1 - step} -4M-2 2L${-2 - step} 4H${-step}M1 2L${1 + step} 4${index ? '' : `M3 -2H${5 + step}V-3M3 2H${5 + step}V3`}`);
    }
    // Reconstruct only recent bite fragments; no accumulating particle state.
    const bite = state.rows.find(row => row.eaten > 0 && row.eaten < 1);
    crumbs.forEach((crumb, index) => {
      const age = ((time * 12 + Math.floor(index / 3)) % 12) / 12;
      const emission = state.distance - age * SPEED;
      const visible = bite && emission >= bite.start && emission <= bite.end;
      crumb.style.display = visible ? '' : 'none';
      if (!visible) return;
      const origin = sample(emission);
      const scatter = Math.sin(index * 97.3);
      crumb.setAttribute('x', origin.x + scatter * age * 12);
      crumb.setAttribute('y', origin.y + 3 - age * (6 + index % 4) + 25 * age * age);
      crumb.setAttribute('opacity', 1 - age);
    });
  };
}
