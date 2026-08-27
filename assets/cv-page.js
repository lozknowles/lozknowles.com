(() => {
  const pdfUrl = "/LawrenceKnowlesProfessionalProfile.pdf";
  const frame = document.querySelector("#cv-document");
  const printButton = document.querySelector("[data-print-cv]");
  const referencesLink = document.querySelector("[data-references-popup]");
  const closeButton = document.querySelector("[data-close-cv]");

  printButton?.addEventListener("click", () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(pdfUrl, "lawrence-profile-print");
    }
  });

  referencesLink?.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const width = Math.min(900, window.screen.availWidth);
    const height = Math.min(860, window.screen.availHeight);
    const left = Math.max(0, Math.round((window.screen.availWidth - width) / 2));
    const top = Math.max(0, Math.round((window.screen.availHeight - height) / 2));
    const referencesWindow = window.open(
      referencesLink.href,
      "lawrence-references",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (referencesWindow) {
      event.preventDefault();
      referencesWindow.focus();
    }
  });

  closeButton?.addEventListener("click", () => {
    if (window.opener) {
      window.close();
      return;
    }

    window.location.href = "/";
  });
})();
