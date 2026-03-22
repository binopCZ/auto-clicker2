// popup.js
// Handles theme toggle, mode selection and injecting the content script.

document.addEventListener("DOMContentLoaded", () => {
  const openBtn       = document.getElementById("open-panel-btn");
  const btnSingle     = document.getElementById("popup-mode-single");
  const btnMulti      = document.getElementById("popup-mode-multi");
  const themeToggle   = document.getElementById("popup-theme-toggle");

  let selectedMode = "single";

  // ----- Theme -----
  function applyTheme(theme) {
    document.body.classList.toggle("theme-green", theme === "green");
  }

  function saveTheme(theme) {
    if (!chrome.storage?.sync) return;
    chrome.storage.sync.set({ ac_theme: theme });
  }

  chrome.storage?.sync?.get({ ac_theme: "blue" }, data => {
    applyTheme(data.ac_theme);
  });

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.ac_theme) {
        applyTheme(changes.ac_theme.newValue);
      }
    });
  }

  themeToggle.addEventListener("click", () => {
    const isGreen = document.body.classList.contains("theme-green");
    const next = isGreen ? "blue" : "green";
    applyTheme(next);
    saveTheme(next);
  });

  // ----- Mode -----
  function setMode(mode) {
    selectedMode = mode;
    btnSingle.classList.toggle("active", mode === "single");
    btnMulti .classList.toggle("active", mode === "multi");
    chrome.storage?.sync?.set({ ac_mode: mode });
  }

  chrome.storage?.sync?.get({ ac_mode: "single" }, data => {
    setMode(data.ac_mode || "single");
  });

  btnSingle.addEventListener("click", () => setMode("single"));
  btnMulti .addEventListener("click", () => setMode("multi"));

  // ----- Open panel in active tab -----
  openBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs && tabs[0];
      if (!tab || typeof tab.id !== "number") return;

      const tabId = tab.id;

      function sendShowPanel() {
        chrome.tabs.sendMessage(
          tabId,
          { type: "ac:show-panel", mode: selectedMode },
          () => {
            // ignore runtime errors here
          }
        );
      }

      // Try to send message first. If it fails, inject content script + CSS.
      chrome.tabs.sendMessage(
        tabId,
        { type: "ac:ping" },
        () => {
          if (chrome.runtime.lastError) {
            chrome.scripting.executeScript(
              {
                target: { tabId },
                files: ["content.js"]
              },
              () => {
                chrome.scripting.insertCSS(
                  {
                    target: { tabId },
                    files: ["styles.css"]
                  },
                  () => {
                    setTimeout(sendShowPanel, 120);
                  }
                );
              }
            );
          } else {
            sendShowPanel();
          }
        }
      );
    });
  });
});
