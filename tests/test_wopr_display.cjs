const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../assets/wopr-light-display.js'), 'utf8');
const epoch = 1791913000;

class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.style = {};
    this.style.setProperty = () => {}; this.style.removeProperty = () => {};
    this.attributes = {}; this.events = {}; this.textContent = ''; this.hidden = false;
    const names = new Set();
    this.classList = {add: name => names.add(name), remove: name => names.delete(name),
      toggle: (name, force) => { if (force === undefined ? !names.has(name) : force) names.add(name); else names.delete(name); },
      contains: name => names.has(name)};
  }
  addEventListener(name, fn) { this.events[name] = fn; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  appendChild(child) { this.children.push(child); }
  append(...children) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
}

async function boot(watts, width = 1280, observedAt = epoch) {
  const ids = Object.fromEntries(['array', 'health-status', 'wopr-power', 'machines', 'mode', 'toggle', 'next', 'speed', 'full', 'controls']
    .map(id => [id, new Element()]));
  const timers = new Map(), windowEvents = {}; let now = 0, wallEpoch = epoch;
  const document = {getElementById: id => ids[id], createElement: () => new Element(), addEventListener: () => {}, activeElement: null};
  const sample = {sampled_at: epoch, values: [10, 20, 0, 30, 40, 0]};
  let currentPower = watts === null ? null : {watts, observed_at: observedAt};
  const context = {document, innerWidth: width, location: {search: ''}, performance: {now: () => now},
    Date: class extends Date {static now() {return wallEpoch * 1000;}},
    fetch: async () => ({ok: true, json: async () => ({version: 1, ...sample,
      servers: {H: sample, S: sample, C: sample}, power: {wopr: currentPower}})}),
    AbortSignal, URLSearchParams, Math, Number, Array, String,
    setInterval: (fn, ms) => {timers.set(ms, fn); return ms;}, clearInterval: ms => timers.delete(ms),
    setTimeout: () => 0, clearTimeout: () => {}, addEventListener: (name, fn) => {windowEvents[name] = fn;}};
  vm.runInNewContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {ids, timers, context, windowEvents, tick(ms) {now = ms; timers.get(210)();},
    advanceWall(seconds) {wallEpoch += seconds; timers.get(1000)();},
    async updatePower(value, at = epoch) {currentPower = value === null ? null : {watts: value, observed_at: at};
      await timers.get(10000)(); await new Promise(resolve => setImmediate(resolve));}};
}

(async () => {
  const phases = await boot(136.7);
  const sequence = [[0, 'wopr'], [5000, 'H-bars'], [10000, 'S-bars'], [15000, 'wopr'],
    [20000, 'C-bars'], [25000, 'wopr-power'], [30000, 'wopr']];
  for (const [ms, phase] of sequence) {phases.tick(ms); assert.equal(phases.ids.array.dataset.phase, phase, `phase at ${ms}`);}
  for (const watts of [0, 136.7, 999.9, 1000, 4000]) {
    const page = await boot(watts, 390); page.tick(25000);
    assert.equal(page.ids.array.dataset.grid, 'power');
    assert.equal(page.ids.array.children.length, 32 * 12);
    assert.equal(page.ids.array.getAttribute('aria-label'), `WOPR plug power ${watts.toFixed(1)} watts`);
    assert.ok(page.ids.array.children.some(led => led.classList.contains('on')));
    assert.ok(page.ids.array.children.every(led => led.style.visibility !== 'hidden'));
  }
  for (const [value, time] of [[null, epoch], ['bad', epoch], [12, epoch - 36], [12, epoch + 6]]) {
    const page = await boot(value, 390, time); page.tick(25000);
    assert.equal(page.ids.array.getAttribute('aria-label'), 'WOPR plug power unavailable');
    assert.equal(page.ids['wopr-power'].textContent, 'WOPR POWER  unavailable');
  }
  const paused = await boot(136.7); paused.tick(25000);
  paused.ids.toggle.events.click({currentTarget: paused.ids.toggle});
  paused.advanceWall(36);
  assert.equal(paused.ids.array.getAttribute('aria-label'), 'WOPR plug power unavailable');
  assert.equal(paused.ids['wopr-power'].textContent, 'WOPR POWER  unavailable');
  await paused.updatePower(null);
  assert.equal(paused.ids.array.dataset.phase, 'wopr-power');
  assert.equal(paused.ids.array.getAttribute('aria-label'), 'WOPR plug power unavailable');
  const resized = await boot(136.7); resized.tick(25000);
  resized.context.innerWidth = 390; resized.windowEvents.resize();
  assert.equal(resized.ids.array.dataset.grid, 'power');
  assert.equal(resized.ids.array.children.length, 32 * 12);
  resized.ids.mode.events.click();
  assert.equal(resized.ids.array.dataset.grid, 'lights');
  assert.equal(resized.ids.array.dataset.phase, 'wopr');
  console.log('WOPR display phases, values, freshness and paused refresh passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
