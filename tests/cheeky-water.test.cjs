const test = require('node:test');
const assert = require('node:assert/strict');
const { Surface, PoseGate, gravity, screenVector } = require('../assets/cheeky-water.js');
const steps = (s, n, calm = false) => { for (let i = 0; i < n; i++) s.step(1 / 120, calm); };
const average = values => values.reduce((a, b) => a + b, 0) / values.length;

test('gravity maps portrait and both landscape orientations while preserving face direction', () => {
  const portrait = gravity(0, 30, 0), left = gravity(0, 30, 90), right = gravity(0, 30, 270);
  assert.ok(portrait.x > .49 && Math.abs(portrait.y) < 1e-10);
  assert.ok(left.y < -.49 && right.y > .49);
  assert.equal(portrait.z, left.z); assert.equal(portrait.z, right.z);
  assert.ok(gravity(180, 0, 90).z < -.99);
  for (const angle of [0, 90, 180, 270]) {
    const g = gravity(36, 25, angle);
    assert.ok(Math.abs(Math.hypot(g.x, g.y, g.z) - 1) < 1e-12);
    const v = screenVector(2, -3, angle); assert.ok(Math.abs(Math.hypot(v.x, v.y) - Math.sqrt(13)) < 1e-12);
  }
});
test('stable entry, hysteresis, stable exit and cooldown suppress threshold chatter', () => {
  const gate = new PoseGate();
  assert.equal(gate.observe(-.9, 0), null);
  for (let t = 100; t < 1100; t += 100) assert.equal(gate.observe(-.9, t), null);
  assert.equal(gate.observe(-.9, 1100), 'down'); assert.equal(gate.allowLine(1100), true);
  for (let t = 1200; t < 3000; t += 100) assert.equal(gate.observe(t % 200 ? -.4 : -.7, t), null);
  assert.equal(gate.observe(.9, 3000), null); assert.equal(gate.observe(.9, 3100), null);
  assert.equal(gate.observe(.9, 3300), 'up'); assert.equal(gate.allowLine(4000), false); assert.equal(gate.allowLine(13100), true);
});
test('coalesced orientation events can establish a held pose, but early return cancels it', () => {
  const gate = new PoseGate(); gate.observe(-1, 0);
  assert.equal(gate.tick(1000), null); assert.equal(gate.tick(1100), 'down');
  gate.reset(); gate.observe(-1, 2000); gate.observe(1, 2500); assert.equal(gate.tick(5000), null);
});
test('tilt collects water at the lower side, exposes the upper floor and conserves volume', () => {
  const s = new Surface(); s.tilt(.8, 0); steps(s, 1200);
  assert.ok(s.sample(1, .5) > .9); assert.ok(s.sample(0, .5) < .025);
  assert.ok(Math.abs(average(s.h) - .55) < .00004);
  s.tilt(-.8, 0); steps(s, 1200); assert.ok(s.sample(0, .5) > .9); assert.ok(s.sample(1, .5) < .025);
});
test('a touch creates a local non-planar wave that continues then settles', () => {
  const s = new Surface(); s.disturb(.35, .55, 1.2); steps(s, 36);
  const energy = s.energy(), spread = Math.max(...s.h) - Math.min(...s.h);
  assert.ok(energy > 1e-5 && spread > .004);
  const middle = s.sample(.35, .55), sides = (s.sample(.2, .55) + s.sample(.5, .55)) / 2;
  assert.ok(Math.abs(middle - sides) > .001);
  steps(s, 1800); assert.ok(s.energy() < energy / 1000); assert.ok(Math.max(...s.h) - Math.min(...s.h) < .0001);
});
test('acceleration injects wave momentum and reduced motion reduces it', () => {
  const normal = new Surface(), calm = new Surface(); normal.accelerate(7, -4); calm.accelerate(7, -4, true);
  assert.ok(normal.energy() > calm.energy() * 8); steps(normal, 24); assert.ok(Math.max(...normal.h) - Math.min(...normal.h) > .01);
});
test('extreme changing motion remains finite, bounded and volume-conserving', () => {
  const s = new Surface(); s.reset(.85);
  for (let n = 0; n < 5000; n++) {
    if (n % 30 === 0) { s.tilt(Math.sin(n * .3), Math.cos(n * .4)); s.accelerate(100 * Math.sin(n), 90 * Math.cos(n)); }
    s.step(n % 7 ? 1 / 120 : 10);
  }
  assert.ok(s.h.every(v => Number.isFinite(v) && v >= .018 && v <= .975));
  assert.ok(s.v.every(Number.isFinite)); assert.ok(Math.abs(average(s.h) - .85) < .00004);
  s.reset(.15); assert.ok(s.v.every(v => v === 0)); assert.ok(s.h.every(v => v === .15));
});
test('water pressed against the glass settles under a sustained steep tilt', () => {
  const s = new Surface(); s.tilt(.8, -.5); steps(s, 240); const moving = s.energy();
  steps(s, 1560); assert.ok(s.energy() < moving / 5000);
});
