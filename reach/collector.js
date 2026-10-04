/* First-party aggregate actions only. Integrate explicit successful-action calls. */
(() => {
  'use strict';
  const domain = location.hostname.replace(/^www\./, '');
  if (!['lozknowles.com', 'collingham.org'].includes(domain)) return;
  const field = /^[a-z0-9][a-z0-9_-]{0,47}$/;
  const events = new Set(['walk_start', 'ask_use', 'narration_play']);
  const params = new URLSearchParams(location.search);
  const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  let context = null;
  try {
    const existing = JSON.parse(sessionStorage.getItem('reach_campaign') || 'null');
    if (existing && Date.now() - existing.at < 1800000 && typeof existing.tag === 'string') context = existing;
    if (keys.slice(0,3).every(key => params.getAll(key).length === 1 && field.test(params.get(key))) &&
        (!params.has('utm_content') || (params.getAll('utm_content').length === 1 && field.test(params.get('utm_content')))) &&
        [...params.keys()].filter(key => key.startsWith('utm_')).every(key => keys.includes(key))) {
      context = {at: Date.now(), tag: keys.map(key => params.get(key) || '').join('|')};
      sessionStorage.setItem('reach_campaign', JSON.stringify(context));
    }
  } catch { context = null; }
  const last = new Map();
  window.reachAction = event => {
    if (!events.has(event)) return;
    // Prevent duplicate event emissions from a single UI transition.
    const stamp = Date.now();
    if (stamp - (last.get(event) || 0) < 1500) return;
    last.set(event, stamp);
    const body = {domain, event};
    if (context && stamp - context.at < 1800000) body.campaign = context.tag;
    fetch('/reach-collect', {
      method: 'POST', credentials: 'omit', mode: 'same-origin', keepalive: true,
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)
    }).catch(() => {});
  };
})();

