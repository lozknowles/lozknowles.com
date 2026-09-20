const studio = document.querySelector('#debate-studio');
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== studio?.contentWindow || event.data?.type !== 'llm-debate-height') return;
  const height = Number(event.data.height);
  if (Number.isFinite(height) && height >= 200 && height <= 12000) studio.style.height = `${height}px`;
});
