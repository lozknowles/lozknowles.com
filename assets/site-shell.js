(() => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const toggle = header.querySelector('.site-menu-toggle');
  const nav = header.querySelector('.site-navigation');
  const compact = matchMedia('(max-width: 1199px)');
  header.classList.add('site-menu-ready');
  function closeMenu(returnFocus = false) {
    header.removeAttribute('data-menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    header.toggleAttribute('data-menu-open', open);
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) closeMenu();
  });
  header.addEventListener('keydown', event => {
    if (event.key === 'Escape' && header.hasAttribute('data-menu-open')) {
      closeMenu(true);
    }
  });
  document.addEventListener('pointerdown', event => {
    if (!header.contains(event.target)) closeMenu();
  });
  header.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (!header.contains(document.activeElement)) closeMenu();
    });
  });
  compact.addEventListener('change', () => closeMenu());
  function highlightSection() {
    if (document.body.dataset.sitePage !== 'home') return;
    nav.querySelectorAll('a').forEach(link => {
      const selected = location.hash && link.getAttribute('href') === `/${location.hash}`;
      if (selected) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  addEventListener('hashchange', highlightSection);
  highlightSection();
})();
