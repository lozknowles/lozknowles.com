const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../assets/cheeky-water.js');
const lines = require('../assets/cheeky-lines.js');
function harness(permission = 'granted') {
  let now = 0, nextId = 0;
  const timers = new Map(), elements = {}, log = [];
  const target = () => ({ handlers: {}, addEventListener(k, fn) { (this.handlers[k] ||= new Set()).add(fn); }, removeEventListener(k, fn) { this.handlers[k]?.delete(fn); }, async emit(k, e = {}) { await Promise.all([...(this.handlers[k] || [])].map(fn => fn(e))); } });
  const clock = (fn, delay, interval = false) => { const id = ++nextId; timers.set(id, { fn, at: now + delay, interval: interval ? delay : 0 }); return id; };
  const element = id => elements[id] ||= Object.assign(target(), { value: id === 'gap' ? '30' : id === 'level' ? '55' : '', checked: false, disabled: false, textContent: '', attrs: {}, replaceChildren(...children) { this.options = children; this.value = children[0].value; }, add(child) { this.options.push(child); }, setAttribute(k, v) { this.attrs[k] = v; } });
  const classes = new Set(), document = Object.assign(target(), { hidden: false, getElementById: element, body: { classList: { add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, v) => v ? classes.add(x) : classes.delete(x) } } });
  const scene = { running: false, manual: false, calm: false, lastGravity: null, lastAcceleration: null, start() { this.running = true; }, pause() { this.running = false; }, reset() { classes.delete('submerged'); }, gravity(v) { this.lastGravity = v; }, acceleration(v) { this.lastAcceleration = v; }, underwater(v) { v ? classes.add('submerged') : classes.delete('submerged'); }, useSensors() {} };
  let audio;
  class Audio {
    constructor(note) { audio = this; this.note = note; this.busy = false; this.muted = false; this.under = false; this.duration = 2400; }
    unlock() { return Promise.resolve(true); }
    stop() { this.cancel?.(); this.busy = false; this.under = false; }
    suspend() { this.stop(); this.suspended = true; }
    mute(v) { this.muted = v; if (v) this.stop(); }
    ambient(v) { this.under = v && !this.muted; }
    bubble() {}
    say(id, voice, recorded, underwater) {
      this.stop(); this.busy = true; log.push({ id, at: now, muted: this.muted, underwater, recorded, voice: voice?.name });
      return new Promise(resolve => { const token = clock(() => { this.cancel = null; this.busy = false; log.push({ ended: id, at: now }); resolve(true); }, this.duration); this.cancel = () => { timers.delete(token); this.cancel = null; resolve(false); }; });
    }
  }
  const screen = { orientation: Object.assign(target(), { angle: 0 }) };
  const deviceVoice = { voiceURI: 'george', name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB', localService: true };
  const window = Object.assign(target(), { cheekyScene: scene, isSecureContext: true, speechSynthesis: Object.assign(target(), { getVoices: () => [deviceVoice], cancel() {} }), DeviceOrientationEvent: { requestPermission: () => typeof permission === 'string' ? Promise.resolve(permission) : permission }, DeviceMotionEvent: { requestPermission: () => typeof permission === 'string' ? Promise.resolve(permission) : permission } });
  const context = { window, document, screen, CheekyWater: core, CheekyAudio: Audio, CheekyLines: lines, performance: { now: () => now }, Option: function(text, value) { this.text = text; this.value = value; }, setInterval: (fn, ms) => clock(fn, ms, true), clearInterval: id => timers.delete(id), console };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/cheeky-phone.js'), 'utf8'), context);
  const tick = async ms => {
    const end = now + ms;
    while (true) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break; const [id, timer] = due; now = timer.at;
      if (timer.interval) timer.at += timer.interval; else timers.delete(id);
      timer.fn(); await Promise.resolve(); await Promise.resolve();
    }
    now = end; await Promise.resolve();
  };
  const pose = async (beta, gamma = 0, duration = 1200) => { for (let i = 0; i <= duration; i += 100) { await window.emit('deviceorientation', { beta, gamma }); if (i < duration) await tick(100); } };
  return { element, window, document, scene, classes, screen, log, tick, pose, get audio() { return audio; }, now: () => now };
}
test('denied permission keeps Start session, samples and underwater preview usable', async () => {
  const h = harness('denied'); await h.element('start').emit('click');
  assert.equal(h.scene.running, true); assert.equal(h.element('preview').disabled, false);
  assert.match(h.element('help').textContent, /denied/); assert.equal(h.window.handlers.deviceorientation?.size || 0, 0);
  await h.element('preview').emit('click'); assert.ok(h.classes.has('submerged')); assert.equal(h.log.filter(e => e.id === 'down').length, 1);
});
test('Stop during pending permission cannot resurrect listeners, rendering or speech', async () => {
  let resolve; const h = harness(new Promise(r => { resolve = r; }));
  const starting = h.element('start').emit('click'); await h.element('stop').emit('click'); resolve('granted'); await starting;
  assert.equal(h.scene.running, false); assert.equal(h.audio.busy, false); assert.equal(h.element('stop').disabled, true);
  assert.equal(h.window.handlers.deviceorientation?.size || 0, 0); await h.tick(15000); assert.ok(!h.log.some(e => e.id === 'breathe'));
});
test('breathing request waits five seconds after the first line actually finishes', async () => {
  const h = harness(); await h.element('start').emit('click'); await h.pose(180);
  const first = h.log.find(e => e.id === 'down'); assert.ok(first && first.underwater);
  await h.pose(180, 0, 10000);
  const ended = h.log.find(e => e.ended === 'down'), breath = h.log.find(e => e.id === 'breathe');
  assert.ok(ended && breath); assert.ok(breath.at - ended.at >= 5000 && breath.at - ended.at <= 5100);
  assert.equal(h.log.filter(e => e.id === 'down').length, 1);
});
test('early upright return cancels unfinished down speech and the breathing request', async () => {
  const h = harness(); await h.element('start').emit('click'); await h.pose(180); await h.pose(20, 0, 400); await h.tick(15000);
  assert.equal(h.classes.has('submerged'), false); assert.ok(!h.log.some(e => e.id === 'breathe'));
  assert.ok(h.log.some(e => e.id === 'air' && !e.underwater)); assert.ok(!h.log.some(e => e.ended === 'down'));
});
test('return during the five-second wait cancels the breathing request', async () => {
  const h = harness(); await h.element('start').emit('click'); await h.pose(180, 0, 4500); await h.pose(20, 0, 400); await h.tick(15000);
  assert.ok(h.log.some(e => e.ended === 'down')); assert.ok(!h.log.some(e => e.id === 'breathe'));
});
test('rapid repeated inversions change the scene but do not repeat remarks', async () => {
  const h = harness(); await h.element('start').emit('click'); await h.pose(180); await h.pose(0, 0, 400); await h.pose(180);
  assert.equal(h.log.filter(e => e.id === 'down').length, 1); assert.ok(h.classes.has('submerged'));
});
test('quiet, voice change and Stop each discard pending underwater remarks', async () => {
  for (const action of ['mute','voice','stop']) {
    const h = harness(); await h.element('start').emit('click'); await h.element('preview').emit('click'); await h.tick(3000);
    h.element('mute').checked = true; await h.element(action).emit(action === 'stop' ? 'click' : 'change'); await h.tick(15000);
    assert.ok(!h.log.some(e => e.id === 'breathe')); assert.equal(h.audio.busy, false); assert.equal(h.audio.under, false);
  }
});
test('hidden/resume pauses rendering and audio; requires a fresh stable pose', async () => {
  const h = harness(); await h.element('start').emit('click'); await h.element('preview').emit('click');
  h.document.hidden = true; await h.document.emit('visibilitychange'); await h.tick(15000);
  assert.equal(h.scene.running, false); assert.equal(h.audio.suspended, true); assert.ok(!h.log.some(e => e.id === 'breathe'));
  h.document.hidden = false; await h.document.emit('visibilitychange'); assert.equal(h.scene.running, true); assert.equal(h.classes.has('submerged'), false);
  await h.pose(180, 0, 1000); assert.equal(h.classes.has('submerged'), false); await h.pose(180, 0, 200); assert.equal(h.classes.has('submerged'), true);
});
test('sensor handlers feed mapped gravity and acceleration into the water simulation', async () => {
  const h = harness(); await h.element('start').emit('click'); h.screen.orientation.angle = 90; await h.pose(0, 30, 0);
  assert.ok(h.scene.lastGravity.y < -.49);
  await h.window.emit('devicemotion', { acceleration: { x: 4, y: 0, z: 0 } }); assert.ok(h.scene.lastAcceleration.y > 0);
});
test('motion-only fallback detects a stable face-down pose', async () => {
  const h = harness(); await h.element('start').emit('click');
  for (let i = 0; i < 15; i++) { await h.window.emit('devicemotion', { accelerationIncludingGravity: { x: 0, y: 0, z: -9.81 } }); await h.tick(100); }
  assert.ok(h.classes.has('submerged'));
});
test('an interrupted periodic motion stream cannot trigger a late breathing request', async () => {
  const h = harness(); await h.element('start').emit('click'); await h.pose(180); await h.tick(12000);
  // A coalesced orientation-only source is valid while the pose stays unchanged.
  assert.ok(h.log.some(e => e.id === 'breathe'));
  const m = harness(); await m.element('start').emit('click'); await m.pose(180);
  await m.window.emit('devicemotion',{accelerationIncludingGravity:{x:0,y:0,z:-9.81}}); await m.tick(12000);
  assert.ok(!m.log.some(e => e.id === 'breathe'));
});
test('manual tilt suppresses sensor pose triggers until phone motion is selected again', async () => {
  const h=harness();await h.element('start').emit('click');h.scene.manual=true;await h.element('tilt-x').emit('input');await h.pose(180,0,5000);
  assert.equal(h.classes.has('submerged'),false);assert.ok(!h.log.some(e=>e.id==='down'));
  h.scene.manual=false;await h.element('sensors').emit('click');await h.pose(180);assert.equal(h.classes.has('submerged'),true);
});
