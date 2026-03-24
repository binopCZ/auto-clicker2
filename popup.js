document.addEventListener("DOMContentLoaded", () => {
  const openButton = document.getElementById("open-panel");
  const panel = document.getElementById("ac-panel");
  const themeToggle = document.getElementById("ac-theme-toggle");
  const singleButton = document.getElementById("mode-single");
  const multiButton = document.getElementById("mode-multi");

  let selectedMode = "single";

  function applyTheme(theme) {
    if (panel) {
      panel.setAttribute("data-theme", theme);
    }
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

  function updateModeButtons() {
    singleButton.classList.toggle("active", selectedMode === "single");
    multiButton.classList.toggle("active", selectedMode === "multi");
  }

  function loadMode() {
    if (!chrome.storage || !chrome.storage.sync) {
      selectedMode = "single";
      updateModeButtons();
      return;
    }
    chrome.storage.sync.get({ acLauncherMode: "single" }, (data) => {
      selectedMode = data.acLauncherMode === "multi" ? "multi" : "single";
      updateModeButtons();
    });
  }

  function saveMode(mode) {
    if (!chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ acLauncherMode: mode });
  }

  function selectMode(mode) {
    selectedMode = mode === "multi" ? "multi" : "single";
    updateModeButtons();
    saveMode(selectedMode);
  }

  loadTheme();
  loadMode();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = (panel && panel.getAttribute("data-theme")) || "dark";
      const next = current === "dark" ? "light" : "dark";
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

  singleButton.addEventListener("click", () => selectMode("single"));
  multiButton.addEventListener("click", () => selectMode("multi"));

  openButton.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        window.close();
        return;
      }
      
      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: "ac:show-panel", mode: selectedMode },
        (response) => {
          if (chrome.runtime.lastError) {
             console.log("Error sending message to tab: ", chrome.runtime.lastError.message);
          }
          setTimeout(() => {
             window.close();
          }, 100);
        }
      );
    });
  });
});
