// popup.js
// Handles theme toggle, mode selection, and content script injection.

document.addEventListener("DOMContentLoaded", () => {
  const openBtn     = document.getElementById("open-panel-btn");
  const btnSingle   = document.getElementById("popup-mode-single");
  const btnMulti    = document.getElementById("popup-mode-multi");
  const themeToggle = document.getElementById("theme-toggle");

  let selectedMode = "single";

  // ── Theme ───────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  function saveTheme(theme) {
    chrome.storage?.sync?.set({ ac_theme: theme });
  }

  chrome.storage?.sync?.get({ ac_theme: "dark" }, data => {
    applyTheme(data.ac_theme ?? "dark");
  });

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes.ac_theme) {
        applyTheme(changes.ac_theme.newValue);
      }
    });
  }

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    saveTheme(next);
  });

  // ── Mode ────────────────────────────────────────────────
  function setMode(mode) {
    selectedMode = mode;
    btnSingle.classList.toggle("active", mode === "single");
    btnMulti.classList.toggle("active",  mode === "multi");
    chrome.storage?.sync?.set({ ac_mode: mode });
  }

  chrome.storage?.sync?.get({ ac_mode: "single" }, data => {
    setMode(data.ac_mode || "single");
  });

  btnSingle.addEventListener("click", () => setMode("single"));
  btnMulti.addEventListener("click",  () => setMode("multi"));

  // ── Open panel in active tab ────────────────────────────
  openBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const tab = tabs?.[0];
      if (!tab || typeof tab.id !== "number") return;

      const tabId = tab.id;

      function sendShowPanel() {
        chrome.tabs.sendMessage(
          tabId,
          { type: "ac:show-panel", mode: selectedMode },
          () => void chrome.runtime.lastError
        );
      }

      chrome.tabs.sendMessage(tabId, { type: "ac:ping" }, () => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript(
            { target: { tabId }, files: ["content.js"] },
            () => {
              chrome.scripting.insertCSS(
                { target: { tabId }, files: ["styles.css"] },
                () => setTimeout(sendShowPanel, 120)
              );
            }
          );
        } else {
          sendShowPanel();
        }
      });
    });
  });
});
