(() => {
  'use strict';
  const grid = document.getElementById('usage-accounts');
  const status = document.getElementById('usage-status');
  const refresh = document.getElementById('usage-refresh');
  const recommendation = document.getElementById('usage-recommendation');
  const recommendationName = document.getElementById('usage-recommendation-name');
  const recommendationReason = document.getElementById('usage-recommendation-reason');
  const csrf = document.querySelector('meta[name="csrf-token"]').content;
  let latestData = null;
  const money = value => new Intl.NumberFormat(undefined, {style: 'currency', currency: 'USD'}).format(value);
  const integer = value => new Intl.NumberFormat().format(value);
  const ukResetDate = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const ukResetOffset = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', timeZoneName: 'longOffset'
  });
  const unit = (count, name) => `${count} ${name}${count === 1 ? '' : 's'}`;
  function timeUntil(resetAt) {
    const minutesLeft = Math.max(0, Math.ceil((resetAt - Date.now()) / 60000));
    const days = Math.floor(minutesLeft / 1440);
    const hours = Math.floor((minutesLeft % 1440) / 60);
    const minutes = minutesLeft % 60;
    return minutesLeft === 0 ? 'now' : `in ${[
      days ? unit(days, 'day') : null,
      hours ? unit(hours, 'hour') : null,
      days === 0 && minutes ? unit(minutes, 'minute') : null
    ].filter(Boolean).join(' ')}`;
  }
  function resetText(window) {
    const resetAt = Date.parse(window.resets_at);
    if (!Number.isFinite(resetAt)) return `${window.remaining_percent}% remaining · reset time unavailable`;
    const offset = ukResetOffset.formatToParts(resetAt).find(part => part.type === 'timeZoneName').value;
    const zone = offset === 'GMT+01:00' ? 'BST' : (offset === 'GMT+00:00' || offset === 'GMT' ? 'GMT' : offset);
    return `${window.remaining_percent}% remaining · resets ${timeUntil(resetAt)} · ${ukResetDate.format(resetAt)} ${zone} (UK)`;
  }
  function chooseAccount(data) {
    const updated = Date.parse(data?.updated_at);
    const now = Date.now();
    if (!Number.isFinite(updated) || Math.abs(now - updated) > 600000 || !Array.isArray(data?.accounts)) return null;
    const candidates = [];
    data.accounts.forEach((account, index) => {
      if (account?.codex?.status !== 'current' || !account.codex.value) return;
      const limits = account.codex.value;
      if (limits.other_windows != null && !Array.isArray(limits.other_windows)) return;
      const reported = [
        ['five-hour', limits.five_hour], ['weekly', limits.weekly],
        ...(limits.other_windows || []).map(window => [
          Number.isInteger(window?.duration_minutes) && window.duration_minutes > 0 ?
            (window.duration_minutes % 1440 === 0 ? `${window.duration_minutes / 1440}-day` : `${window.duration_minutes}-minute`) : null,
          window
        ])
      ].filter(([, value]) => value !== null && value !== undefined);
      if (!reported.length || reported.some(([label, value]) => !label ||
          typeof value?.remaining_percent !== 'number' || !Number.isFinite(value.remaining_percent) ||
          value.remaining_percent <= 0 || value.remaining_percent > 100 ||
          !Number.isFinite(Date.parse(value.resets_at)) || Date.parse(value.resets_at) <= now)) return;
      const next = reported.map(([label, value]) => ({label, at: Date.parse(value.resets_at)}))
        .sort((a, b) => a.at - b.at)[0];
      candidates.push({index, name: account.name, next, lowest: Math.min(...reported.map(([, value]) => value.remaining_percent))});
    });
    candidates.sort((a, b) => a.next.at - b.next.at || b.lowest - a.lowest || a.index - b.index);
    return candidates[0] || null;
  }
  function updateRecommendation() {
    const chosen = chooseAccount(latestData);
    recommendation.dataset.state = chosen ? 'ready' : 'unavailable';
    recommendationName.textContent = chosen ? chosen.name : 'No current suggestion';
    recommendationReason.textContent = chosen ?
      `All reported Codex limits have allowance. The ${chosen.next.label} window resets ${timeUntil(chosen.next.at)} and has the earliest reported reset among eligible accounts. Lowest reported remaining allowance: ${chosen.lowest}%.` :
      'No account has fresh, non-exhausted Codex limits across every window it reports.';
    for (const [index, card] of [...grid.children].entries()) {
      card.classList.toggle('usage-card-suggested', index === chosen?.index);
    }
  }
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  };
  function metric(card, title, item, format, codexWindow = false) {
    const box = node('div', 'usage-metric', '');
    box.append(node('span', 'usage-label', title));
    const percent = item?.value?.remaining_percent;
    const validWindow = !codexWindow || item?.value == null ||
      (typeof percent === 'number' && Number.isFinite(percent) && percent >= 0 && percent <= 100 &&
       Number.isFinite(Date.parse(item.value.resets_at)));
    const value = item && item.value !== null && item.value !== undefined && validWindow ? format(item.value) : 'Unavailable';
    const display = node('strong', '', value);
    if (codexWindow && validWindow && item?.value?.resets_at) {
      display.dataset.resetAt = item.value.resets_at;
      display.dataset.remainingPercent = item.value.remaining_percent;
    }
    box.append(display);
    if (codexWindow && validWindow && item?.value != null) {
      const level = percent >= 70 ? 'high' : (percent >= 30 ? 'medium' : 'low');
      box.classList.add(`usage-level-${level}`);
      box.append(node('span', 'usage-band', level === 'high' ? 'High remaining' :
        (level === 'medium' ? 'Moderate remaining' : 'Low remaining')));
    }
    if (codexWindow && !validWindow) box.append(node('small', '', 'Quota data invalid'));
    if (item?.reason) box.append(node('small', '', item.reason));
    return card.appendChild(box);
  }
  function render(data) {
    latestData = data;
    grid.replaceChildren();
    data.accounts.forEach((account, index) => {
      const card = node('article', 'usage-card', '');
      card.append(node('p', 'usage-eyebrow', `ACCOUNT ${String(index + 1).padStart(2, '0')} / ${account.products.join(' + ').toUpperCase() || 'UNCONFIGURED'}`));
      card.append(node('h2', '', account.name));
      card.append(node('p', 'usage-subscription', `Subscription: ${account.subscription || 'Unavailable'}`));
      const codexWindow = key => {
        const value = account.codex?.value?.[key] ?? null;
        return {value, reason: value === null ? (account.codex?.reason || 'This quota window was not returned') : null};
      };
      metric(card, 'Codex five-hour allowance', codexWindow('five_hour'), resetText, true);
      metric(card, 'Codex weekly allowance', codexWindow('weekly'), resetText, true);
      const durationText = minutes => minutes % 1440 === 0 ? `${minutes / 1440}-day` :
        (minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes}-minute`);
      for (const window of account.codex?.value?.other_windows || []) {
        if (Number.isInteger(window.duration_minutes) && window.duration_minutes > 0) {
          metric(card, `Codex ${durationText(window.duration_minutes)} allowance`, {value: window}, resetText, true);
        }
      }
      metric(card, 'ChatGPT allowance', account.chatgpt, value => String(value));
      metric(card, 'API credits remaining', account.api_credits_usd, money);
      metric(card, 'API spend · month to date', account.api_spend_usd, money);
      metric(card, 'API completion tokens · input / output', account.api_tokens,
        value => `${integer(value.input_tokens)} / ${integer(value.output_tokens)}`);
      grid.append(card);
    });
    updateRecommendation();
    const combined = document.getElementById('usage-total-value');
    combined.textContent = data.combined_api_spend_usd === null ? 'Unavailable' : money(data.combined_api_spend_usd);
    document.getElementById('usage-total-note').textContent = data.combined_reason || 'Unique API organizations with complete costs data';
    status.textContent = data.configuration_error ? 'Private account configuration is invalid; other hub services remain available.' :
      (data.updated_at ? `Updated ${new Date(data.updated_at).toLocaleString()} · Refreshes every five minutes` : (data.reason || 'Usage unavailable'));
  }
  async function load(manual = false) {
    refresh.disabled = true;
    status.textContent = 'Refreshing usage…';
    try {
      const response = await fetch(manual ? '/api/openai-usage/refresh' : '/api/openai-usage', {
        method: manual ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        headers: manual ? {'X-CSRF-Token': csrf} : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      render(await response.json());
    } catch (_) {
      latestData = null;
      updateRecommendation();
      status.textContent = 'Could not load usage. Your session or the provider may be unavailable.';
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.addEventListener('click', () => load(true));
  load();
  setInterval(() => {
    if (document.hidden) return;
    for (const display of grid.querySelectorAll('[data-reset-at]')) {
      display.textContent = resetText({
        remaining_percent: display.dataset.remainingPercent,
        resets_at: display.dataset.resetAt
      });
    }
    updateRecommendation();
  }, 60000);
  setInterval(() => { if (!document.hidden) load(); }, 300000);
})();
