(() => {
  const popupLink = document.querySelector("[data-cv-popup]");

  if (!popupLink) return;

  popupLink.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const width = Math.min(1120, window.screen.availWidth);
    const height = Math.min(900, window.screen.availHeight);
    const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
    const cvWindow = window.open(
      popupLink.href,
      "lawrence-cv",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (cvWindow) {
      event.preventDefault();
      cvWindow.focus();
    }
  });
})();
