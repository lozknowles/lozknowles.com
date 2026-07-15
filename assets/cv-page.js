(() => {
  const pdfUrl = "/LawrenceKnowlesCV.pdf";
  const frame = document.querySelector("#cv-document");
  const printButton = document.querySelector("[data-print-cv]");
  const closeButton = document.querySelector("[data-close-cv]");

  printButton?.addEventListener("click", () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(pdfUrl, "lawrence-cv-print");
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
