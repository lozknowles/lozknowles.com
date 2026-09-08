(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const synth = window.speechSynthesis;
  const lines = {
    down: ["Charming. I know when I’m not wanted."],
    flat: ["Making myself comfortable, am I?", "A little lie-down. Excellent career move.", "Horizontal thinking. I approve."],
    upright: ["Ah, upright again. A triumph of civilisation.", "There we are. Looking terribly productive.", "At attention. Shall I salute?"],
    side: ["Taking a sideways view of things?", "A change of perspective. How refreshing.", "Does this angle make my pixels look big?"],
    shake: ["Steady on. I'm doing my best.", "I'm a phone, not a cocktail.", "The opinions are already quite well stirred."]
  };
  let active = false, generation = 0, timer = null, started = 0, received = false;
  let candidate = '', candidateSince = 0, spokenPose = '', lastSpoken = -Infinity;
  let orientationSeen = false;
  let previousGravity = null, lastShake = 0, voices = [], lastText = '';
  function choose(kind) {
    const filtered = lines[kind].filter(text => text !== lastText);
    const options = filtered.length ? filtered : lines[kind];
    return options[Math.floor(Math.random() * options.length)];
  }
  function hush() { if (synth) synth.cancel(); document.body.classList.remove('speaking'); }
  function say(text, forced = false) {
    const now = performance.now();
    if (document.hidden || (!forced && (now - lastSpoken < Number($('gap').value) * 1000 || synth?.speaking))) return false;
    lastSpoken = now; lastText = text;
    $('remark').textContent = '“' + text + '”';
    hush();
    if (!$('mute').checked && synth && window.SpeechSynthesisUtterance) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-GB'; utterance.rate = 0.92;
      const voice = voices.find(v => v.voiceURI === $('voice').value);
      if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
      utterance.onstart = () => document.body.classList.add('speaking');
      utterance.onend = () => document.body.classList.remove('speaking');
      utterance.onerror = e => {
        document.body.classList.remove('speaking');
        if (!['canceled', 'interrupted'].includes(e.error)) $('help').textContent = 'Speech was unavailable. The comments still appear here; try another voice or tap Try a comment.';
      };
      synth.speak(utterance);
    }
    return true;
  }
  function populateVoices() {
    if (!synth) { $('voice').disabled = true; $('mute').checked = true; return; }
    const old = $('voice').value;
    voices = synth.getVoices();
    $('voice').replaceChildren(new Option('Device default', ''));
    voices.forEach(v => $('voice').add(new Option(v.name + ' · ' + v.lang, v.voiceURI)));
    if (voices.some(v => v.voiceURI === old)) $('voice').value = old;
    else $('voice').value = voices.find(v => v.lang === 'en-GB' && v.localService)?.voiceURI || '';
  }
  function resetPose() { orientationSeen = false; candidate = ''; spokenPose = ''; previousGravity = null; candidateSince = performance.now(); }
  function consider(kind) {
    const now = performance.now();
    received = true;
    $('status').textContent = 'On · motion available';
    $('pose').textContent = {down:'Screen facing down · reclining, perhaps?',flat:'Screen facing up · taking it easy',upright:'Phone upright',side:'Phone tilted sideways'}[kind];
    if (candidate !== kind) { candidate = kind; candidateSince = now; return; }
    if (now - candidateSince >= 1800 && spokenPose !== kind && say(choose(kind))) spokenPose = kind;
  }
  function orientation(e) {
    if (!active || document.hidden || !Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;
    orientationSeen = true;
    const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    const z = Math.cos(b) * Math.cos(g);
    consider(z < -0.55 ? 'down' : z > 0.8 ? 'flat' : Math.abs(e.gamma) > 45 ? 'side' : 'upright');
  }
  function motion(e) {
    if (!active || document.hidden) return;
    const a = e.acceleration, gravity = e.accelerationIncludingGravity;
    const valid = v => v && ['x','y','z'].every(k => Number.isFinite(v[k]));
    let strength = 0;
    if (valid(a)) strength = Math.hypot(a.x, a.y, a.z);
    else if (valid(gravity) && previousGravity) strength = Math.hypot(gravity.x - previousGravity.x, gravity.y - previousGravity.y, gravity.z - previousGravity.z);
    if (valid(gravity)) {
      previousGravity = {x:gravity.x,y:gravity.y,z:gravity.z};
      const norm = Math.hypot(gravity.x, gravity.y, gravity.z);
      if (!orientationSeen && norm > 5 && norm < 15) consider(gravity.z / norm < -0.55 ? 'down' : gravity.z / norm > 0.8 ? 'flat' : Math.abs(gravity.x / norm) > 0.7 ? 'side' : 'upright');
    }
    if (strength > 12 && performance.now() - lastShake > 2500) {
      lastShake = performance.now(); say(choose('shake'));
    }
  }
  function stop() {
    generation++; active = false; clearInterval(timer); timer = null;
    window.removeEventListener('deviceorientation', orientation);
    window.removeEventListener('devicemotion', motion);
    hush(); resetPose(); $('start').disabled = false; $('stop').disabled = true;
    $('start').textContent = 'Start the commentary'; $('status').textContent = 'Off · commentary stopped';
  }
  $('start').addEventListener('click', async () => {
    const ticket = ++generation;
    if (!window.isSecureContext) { $('help').textContent = 'Open this page over HTTPS to use motion. You can still try a sample comment.'; return; }
    $('start').disabled = true; $('stop').disabled = false;
    $('status').textContent = 'Waiting for motion permission';
    say('Right. I shall provide the commentary. You provide the questionable angles.', true);
    // Both permission requests must begin during this button gesture.
    const request = C => {
      try { return C ? (typeof C.requestPermission === 'function' ? C.requestPermission() : Promise.resolve('granted')) : Promise.resolve('unavailable'); }
      catch (error) { return Promise.reject(error); }
    };
    const grants = await Promise.allSettled([request(window.DeviceOrientationEvent), request(window.DeviceMotionEvent)]);
    if (ticket !== generation) return;
    const allowed = grants.map(r => r.status === 'fulfilled' && r.value === 'granted');
    if (!allowed.some(Boolean)) {
      stop(); $('status').textContent = 'Motion unavailable';
      $('help').textContent = 'Motion access was denied or is unsupported. Check this site’s motion permission in your browser, or use Try a comment.'; return;
    }
    active = true; received = false; started = performance.now(); resetPose();
    if (allowed[0]) window.addEventListener('deviceorientation', orientation);
    if (allowed[1]) window.addEventListener('devicemotion', motion);
    $('status').textContent = 'On · waiting for a sensor reading';
    $('help').textContent = 'Tilt gently, then hold for two seconds. Comments respect your minimum gap and pause when you leave this page.';
    timer = setInterval(() => {
      if (active && !document.hidden && !received && performance.now() - started > 6000) {
        $('status').textContent = 'On · no sensor readings yet';
        $('help').textContent = 'No motion readings received. Try Safari or Chrome on a phone, check motion permissions, or use Try a comment.';
      }
    }, 2000);
  });
  $('stop').addEventListener('click', stop);
  $('sample').addEventListener('click', () => {
    const keys = Object.keys(lines); say(choose(keys[Math.floor(Math.random() * keys.length)]), true);
  });
  $('mute').addEventListener('change', hush);
  $('voice').addEventListener('change', hush);
  document.addEventListener('visibilitychange', () => {
    hush(); resetPose();
    if (active) {
      $('status').textContent = document.hidden ? 'Paused · page hidden' : 'On · waiting for motion';
      received = false; started = performance.now(); lastSpoken = performance.now();
    }
  });
  window.addEventListener('pagehide', stop);
  if (synth) synth.addEventListener('voiceschanged', populateVoices);
  populateVoices();
})();
