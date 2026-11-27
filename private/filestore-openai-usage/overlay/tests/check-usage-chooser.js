const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'static', 'openai-usage.js'), 'utf8');
const start = source.indexOf('  function chooseAccount(data) {');
const end = source.indexOf('  function updateRecommendation() {', start);
assert(start !== -1 && end > start);
const choose = vm.runInNewContext(`${source.slice(start, end)}\nchooseAccount`);
const now = Date.now();
const after = minutes => new Date(now + minutes * 60000).toISOString();
const quota = (remaining_percent, minutes) => ({remaining_percent, resets_at: after(minutes)});
const account = (name, five_hour, weekly, other_windows = [], status = 'current') =>
  ({name, codex: {status, value: {five_hour, weekly, other_windows}}});
const snapshot = accounts => ({accounts, updated_at: new Date(now).toISOString()});
const base = () => snapshot([
  account('Pro', null, quota(34, 9000)),
  account('Pro Lite', null, quota(100, 8000)),
  account('Plus', quota(100, 180), quota(84, 9500)),
  account('Free', null, null, [{...quota(100, 40000), duration_minutes: 43200}])
]);
assert.strictEqual(choose(base()).name, 'Plus', 'short reset with remaining limits');
let data = base(); data.accounts[2].codex.value.weekly.remaining_percent = 0;
assert.strictEqual(choose(data).name, 'Pro Lite', 'exhausted secondary limit excludes account');
data = base(); data.accounts[2].codex.value.five_hour.resets_at = after(-1);
assert.strictEqual(choose(data).name, 'Pro Lite', 'past reset excludes stale quota');
data = base(); data.accounts[2].codex.value.five_hour.remaining_percent = null;
assert.strictEqual(choose(data).name, 'Pro Lite', 'malformed percentage excludes account');
data = base(); data.accounts[1].codex.value.weekly = null;
assert.strictEqual(choose(data).name, 'Plus', 'missing limit is not zero');
data = base(); data.updated_at = new Date(now - 11 * 60000).toISOString();
assert.strictEqual(choose(data).name, 'Plus', 'stale snapshot retains a last-known recommendation');
assert.strictEqual(choose(data).stale, true, 'stale recommendation is explicitly marked');
data = base(); data.updated_at = new Date(now).toISOString();
assert.strictEqual(choose(data).stale, false, 'fresh recommendation is not marked stale');
data = base(); data.accounts.forEach(row => {row.codex.status = 'unavailable';});
assert.strictEqual(choose(data), null, 'all unavailable gets no recommendation');
data = base(); data.accounts[2].codex.value.five_hour.resets_at = data.accounts[1].codex.value.weekly.resets_at;
assert.strictEqual(choose(data).name, 'Pro Lite', 'tie favors higher conservative headroom');
console.log('chooser scenarios passed: 9');
