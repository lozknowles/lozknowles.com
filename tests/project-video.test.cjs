const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const script = readFileSync(process.env.PROJECT_VIDEO_SCRIPT || join(__dirname, '../assets/project-video.js'), 'utf8');

class Element {
  constructor() {
    this.listeners = new Map();
    this.children = [];
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
    };
  }
  addEventListener(type, handler) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), handler]);
  }
  emit(type, values = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler({ target: this, stopPropagation() {}, ...values });
    }
  }
  append(child) { this.children.push(child); }
  setAttribute() {}
  contains(child) { return this === child || this.children.includes(child); }
}

function setup() {
  const document = new Element();
  const window = new Element();
  const timers = new Map();
  let nextTimer = 0;
  let intersect, mutate;
  const cards = [0, 1].map(index => {
    const card = new Element();
    if (!index) card.classList.add('is-active');
    const container = new Element();
    container.closest = () => card;
    const video = new Element();
    Object.assign(video, { paused: true, volume: 1, networkState: 1, playCalls: 0 });
    video.closest = selector => selector === '.project-card' ? card : container;
    video.play = () => {
      video.playCalls++;
      if (video.rejectPlay) return Promise.reject(new Error('Playback not ready'));
      video.paused = false;
      video.emit('play');
      if (!video.buffering) video.emit('playing');
      return Promise.resolve();
    };
    video.pause = () => {
      if (video.paused) return;
      video.paused = true;
      video.emit('pause');
    };
    card.querySelectorAll = () => [video];
    card.querySelector = () => ({ textContent: index ? 'Another experiment' : 'Flower Detection' });
    return Object.assign(card, { video, container });
  });
  document.hidden = false;
  document.querySelectorAll = () => cards;
  document.querySelector = () => null;
  document.createElement = () => new Element();
  const navigator = { connection: { saveData: false } };
  vm.runInNewContext(script, {
    document, window, navigator, console, performance: { now: () => 100 },
    HTMLMediaElement: { NETWORK_NO_SOURCE: 3 },
    MutationObserver: class { constructor(callback) { mutate = callback; } observe() {} },
    IntersectionObserver: class { constructor(callback) { intersect = callback; } observe() {} },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  });
  return {
    cards, document, window, navigator, timers,
    enter: (index = 0, visible = true) => intersect([{
      target: cards[index].video, isIntersecting: visible, intersectionRatio: visible ? 1 : 0,
    }]),
    switchTo(index) {
      cards.forEach((card, i) => card.classList[i === index ? 'add' : 'remove']('is-active'));
      mutate();
    },
    flushTimers() {
      const scheduled = [...timers.values()];
      timers.clear();
      scheduled.forEach(callback => callback());
    },
  };
}

const settled = () => new Promise(resolve => setImmediate(resolve));

test('first visible clip starts muted and waits for actual playback before hiding Play', async () => {
  const page = setup();
  const { video, container } = page.cards[0];
  video.buffering = true;
  page.enter();
  assert.equal(video.paused, false);
  assert.equal(video.muted, true);
  assert.equal(video.autoplay, true);
  assert.equal(container.classList.contains('is-playing'), false);
  video.emit('playing');
  assert.equal(container.classList.contains('is-playing'), true);
  await settled();
});

test('a rejected first start retries when media becomes ready without a click', async () => {
  const page = setup();
  const { video } = page.cards[0];
  video.rejectPlay = true;
  page.enter();
  await settled();
  assert.equal(video.paused, true);
  video.rejectPlay = false;
  video.emit('canplay');
  await settled();
  assert.equal(video.paused, false);
  assert.equal(video.playCalls, 2);
});

test('a browser pause while hidden does not permanently disable autoplay', async () => {
  const page = setup();
  const { video } = page.cards[0];
  page.enter();
  await settled();
  page.document.hidden = true;
  video.pause(); // The browser pauses before our visibilitychange handler runs.
  page.document.emit('visibilitychange');
  page.document.hidden = false;
  page.document.emit('visibilitychange');
  await settled();
  assert.equal(video.paused, false);
});

test('an explicit pause stays paused through readiness, focus and scrolling', async () => {
  const page = setup();
  const { video } = page.cards[0];
  page.enter();
  await settled();
  video.emit('pointerdown');
  video.pause();
  video.emit('canplay');
  page.window.emit('focus');
  page.enter(0, false);
  page.enter();
  page.flushTimers();
  await settled();
  assert.equal(video.paused, true);
  assert.equal(video.autoplay, false);
  assert.equal(video.playCalls, 1);
});

test('only the visible active card plays; a loading clip cannot restart off screen', async () => {
  const page = setup();
  page.enter();
  page.enter(1);
  await settled();
  assert.equal(page.cards[1].video.paused, true);
  page.switchTo(1);
  page.enter(1, false); // Leave view while its play promise is still pending.
  await settled();
  assert.ok(page.cards.every(card => card.video.paused));
});

test('temporary browser pauses recover, with a bounded number of automatic retries', async () => {
  const page = setup();
  const { video } = page.cards[0];
  page.enter();
  await settled();
  for (let i = 0; i < 4; i++) {
    video.pause();
    page.flushTimers();
    await settled();
  }
  assert.equal(video.playCalls, 3);
  assert.equal(page.timers.size, 0);
});
