import { ARCADE_DURATION, createCentipede } from './arcade-centipede.js?v=20260911-centipede-1';

(() => {
  'use strict';
  const scene = document.querySelector('#arcade-scene');
  const stage = document.querySelector('#arcade-stage');
  const machine = document.querySelector('#arcade');
  const toggle = document.querySelector('#play-toggle');
  const replay = document.querySelector('#replay');
  const fullscreen = document.querySelector('#fullscreen');
  const slider = document.querySelector('#arcade-time');
  const readout = document.querySelector('#time-readout');
  const status = document.querySelector('#player-status');
  const state = document.querySelector('#screen-state');
  const label = document.querySelector('#chapter-label');
  const chapters = [...document.querySelectorAll('[data-seek]')];
  const names = ['SPACE INVADERS', 'PAC-MAN', 'BOMBERMAN', 'THE VECTOR TUNNEL', 'TEMPEST', 'DONKEY KONG', 'CENTIPEDE'];
  const duration = ARCADE_DURATION;
  slider.max = duration;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let animations = [];
  let position = 0;
  let startedAt = 0;
  let playing = false;
  let frame = 0;
  let lastPaint = 0;
  let ready = false;
  let scrubbing = false;
  let resumeAfterScrub = false;
  let renderCentipede = () => {};

  const rivers = document.querySelector('#code-rivers');
  let riversStarted = false;
  // Native text paths make the code follow curves without a second frame loop.
  if (rivers && typeof rivers.pauseAnimations === 'function') {
    rivers.pauseAnimations();
    [...rivers.querySelectorAll('text')].forEach((line, index) => {
      const textPath = line.querySelector('textPath');
      const path = rivers.querySelector(textPath.getAttribute('href'));
      const length = path.getTotalLength();
      const source = textPath.textContent;
      textPath.textContent = source.repeat(Math.ceil(length / (source.length * 7)));
      line.setAttribute('textLength', length);
      line.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      const copy = line.cloneNode(true);
      line.after(copy);
      [line, copy].forEach((strand, offset) => {
        const track = strand.querySelector('textPath');
        track.setAttribute('startOffset', `${-offset * 100}%`);
        const flow = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
        Object.entries({ attributeName: 'startOffset', from: `${-offset * 100}%`, to: `${100 - offset * 100}%`, dur: `${150 + index * 11}s`, repeatCount: 'indefinite', begin: 'indefinite' }).forEach(([name, value]) => flow.setAttribute(name, value));
        track.append(flow);
      });
    });
  }

  function flowCode(run) {
    if (!rivers || typeof rivers.pauseAnimations !== 'function') return;
    const flowing = run && !document.hidden && !document.fullscreenElement;
    if (flowing && !riversStarted) {
      rivers.querySelectorAll('animate').forEach(flow => flow.beginElement());
      riversStarted = true;
    }
    flowing ? rivers.unpauseAnimations() : rivers.pauseAnimations();
    rivers.dataset.flowing = String(flowing);
  }

  const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const current = () => playing ? Math.min(duration, (document.timeline.currentTime - startedAt) / 1000) : position;

  function paint() {
    const time = current();
    slider.value = time;
    slider.setAttribute('aria-valuetext', `${clock(time)} of ${clock(duration)}`);
    readout.textContent = `${clock(time)} / ${clock(duration)}`;
    const chapter = Math.max(0, chapters.findLastIndex(button => time >= Number(button.dataset.seek)));
    label.textContent = `${String(chapter + 1).padStart(2, '0')} / ${names[chapter]}`;
    chapters.forEach((button, index) => button.setAttribute('aria-pressed', String(index === chapter)));
    machine.dataset.position = time.toFixed(2);
    machine.dataset.playing = String(playing);
    toggle.textContent = playing ? 'Ⅱ Pause' : '▶ Play';
    toggle.setAttribute('aria-label', playing ? 'Pause arcade' : 'Play arcade');
    state.textContent = playing ? 'NOW PLAYING' : 'PAUSED';
  }

  function tick(now) {
    if (!playing) return;
    if (current() >= duration) {
      seek(0, true);
      return;
    }
    renderCentipede(current());
    if (now - lastPaint > 150) { paint(); lastPaint = now; }
    frame = requestAnimationFrame(tick);
  }

  function pause(message = 'Paused. Take your time. The high score can wait.') {
    if (!ready) return;
    position = current();
    playing = false;
    cancelAnimationFrame(frame);
    animations.forEach(animation => { animation.pause(); animation.currentTime = position * 1000; });
    renderCentipede(position);
    flowCode(false);
    status.textContent = message;
    paint();
  }

  function play(explicit = true) {
    if (!ready) return;
    if (explicit) document.body.dataset.explicitPlay = 'true';
    if (position >= duration) position = 0;
    startedAt = document.timeline.currentTime - position * 1000;
    animations.forEach(animation => {
      animation.play();
      animation.startTime = startedAt;
    });
    playing = true;
    renderCentipede(position);
    flowCode(true);
    status.textContent = 'Enjoy the mash-up. It loops back for another go.';
    cancelAnimationFrame(frame);
    paint();
    frame = requestAnimationFrame(tick);
  }

  function seek(seconds, keepPlaying = playing) {
    if (!ready) return;
    pause();
    position = Math.max(0, Math.min(duration, Number(seconds) || 0));
    animations.forEach(animation => { animation.currentTime = position * 1000; });
    renderCentipede(position);
    paint();
    if (keepPlaying) play(false);
  }

  toggle.addEventListener('click', () => playing ? pause() : play());
  replay.addEventListener('click', () => { seek(0, false); play(); });
  chapters.forEach(button => button.addEventListener('click', () => {
    seek(Number(button.dataset.seek), false);
    if (!reduced.matches || document.body.dataset.explicitPlay === 'true') play();
    else status.textContent = 'Chapter selected. Press Play when you want the animation to move.';
  }));
  slider.addEventListener('pointerdown', () => {
    scrubbing = true;
    resumeAfterScrub = playing;
    pause();
  });
  slider.addEventListener('input', () => seek(slider.value, scrubbing ? false : playing));
  const finishScrub = () => {
    if (!scrubbing) return;
    scrubbing = false;
    if (resumeAfterScrub) play(false);
  };
  window.addEventListener('pointerup', finishScrub);
  window.addEventListener('pointercancel', finishScrub);
  stage.addEventListener('keydown', event => {
    if (!ready || ![' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === ' ') playing ? pause() : play();
    else seek(current() + (event.key === 'ArrowLeft' ? -5 : 5));
  });
  fullscreen.addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await machine.requestFullscreen();
    } catch { status.textContent = 'Full screen is unavailable here. The arcade still works in this window.'; }
  });
  document.addEventListener('fullscreenchange', () => {
    fullscreen.textContent = document.fullscreenElement ? '⛶ Exit full screen' : '⛶ Full screen';
    flowCode(playing);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pause('Paused while you were away. Press Play to carry on.');
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      document.body.dataset.explicitPlay = 'false';
      pause('Your device prefers less motion. Press Play to start the animation.');
    }
  });

  async function load() {
    try {
      const response = await fetch('/assets/arcade-scene.html?v=20260911-1');
      if (!response.ok) throw new Error('The arcade could not be loaded.');
      scene.innerHTML = await response.text();
      renderCentipede = createCentipede(scene);
      animations = scene.getAnimations({ subtree: true });
      if (!animations.length) throw new Error('The animation is unavailable.');
      animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
      ready = true;
      document.querySelector('#load-message').hidden = true;
      [toggle, replay, slider, ...chapters].forEach(control => { control.disabled = false; });
      fullscreen.disabled = !document.fullscreenEnabled;
      if (!document.fullscreenEnabled) fullscreen.hidden = true;
      machine.dataset.ready = 'true';
      paint();
      if (reduced.matches) status.textContent = 'Your device prefers less motion. Press Play to start the animation.';
      else if (document.hidden) status.textContent = 'Ready when you are. Press Play to begin.';
      else play(false);
    } catch {
      state.textContent = 'PLEASE RETRY';
      document.querySelector('#load-message').textContent = 'THE ARCADE NEEDS ANOTHER COIN. RELOAD TO TRY AGAIN.';
      status.textContent = 'The animation could not be loaded. Reload this page to try again.';
    }
  }
  load();
})();
