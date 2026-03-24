document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("open-panel");
  const panel = document.getElementById("ac-panel");
  const themeToggle = document.getElementById("ac-theme-toggle");

  function applyTheme(theme) {
    if (panel) panel.setAttribute("data-theme", theme);
  }

  function loadTheme() {
    if (!chrome.storage || !chrome.storage.sync) {
      applyTheme("dark");
      return;
    }
    chrome.storage.sync.get({ acTheme: "dark" }, (data) => {
      applyTheme(data.acTheme || "dark");
    });
  }

  function saveTheme(theme) {
    if (!chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ acTheme: theme });
  }

  loadTheme();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const cur = (panel && panel.getAttribute("data-theme")) || "dark";
      const next = cur === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
    });
  }

  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.acTheme && changes.acTheme.newValue) {
        applyTheme(changes.acTheme.newValue);
      }
    });
  }

  if (btn) {
    btn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: "show_panel" });
        window.close();
      });
    });
  }
});

