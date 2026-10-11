(() => {
  'use strict';
  const grid = document.getElementById('usage-accounts');
  const status = document.getElementById('usage-status');
  const refresh = document.getElementById('usage-refresh');
  const csrf = document.querySelector('meta[name="csrf-token"]').content;
  const money = value => new Intl.NumberFormat(undefined, {style: 'currency', currency: 'USD'}).format(value);
  const integer = value => new Intl.NumberFormat().format(value);
  const node = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value;
    return element;
  };
  function metric(card, title, item, format) {
    const box = node('div', 'usage-metric', '');
    box.append(node('span', 'usage-label', title));
    const value = item && item.value !== null && item.value !== undefined ? format(item.value) : 'Unavailable';
    box.append(node('strong', '', value));
    if (item?.reason) box.append(node('small', '', item.reason));
    return card.appendChild(box);
  }
  function render(data) {
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
      const windowText = value => `${value.remaining_percent}% remaining · resets ${new Date(value.resets_at).toLocaleString()}`;
      metric(card, 'Codex five-hour allowance', codexWindow('five_hour'), windowText);
      metric(card, 'Codex weekly allowance', codexWindow('weekly'), windowText);
      const durationText = minutes => minutes % 1440 === 0 ? `${minutes / 1440}-day` :
        (minutes % 60 === 0 ? `${minutes / 60}-hour` : `${minutes}-minute`);
      for (const window of account.codex?.value?.other_windows || []) {
        if (Number.isInteger(window.duration_minutes) && window.duration_minutes > 0) {
          metric(card, `Codex ${durationText(window.duration_minutes)} allowance`, {value: window}, windowText);
        }
      }
      metric(card, 'ChatGPT allowance', account.chatgpt, value => String(value));
      metric(card, 'API credits remaining', account.api_credits_usd, money);
      metric(card, 'API spend · month to date', account.api_spend_usd, money);
      metric(card, 'API completion tokens · input / output', account.api_tokens,
        value => `${integer(value.input_tokens)} / ${integer(value.output_tokens)}`);
      grid.append(card);
    });
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
      status.textContent = 'Could not load usage. Your session or the provider may be unavailable.';
    } finally {
      refresh.disabled = false;
    }
  }
  refresh.addEventListener('click', () => load(true));
  load();
  setInterval(() => { if (!document.hidden) load(); }, 300000);
})();
