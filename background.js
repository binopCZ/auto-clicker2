// background.js
// Service worker — handles Cookie Clicker integration via MAIN world injection.

async function executeInMainWorld(tabId, func, args = []) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args
  });
}

// ── Cookie Clicker functions (run in page context) ──────

function startCookieClicker(intervalMs) {
  const ms = Math.max(10, Number(intervalMs) || 50);

  if (window.__ac_cookieTimer) {
    clearInterval(window.__ac_cookieTimer);
    window.__ac_cookieTimer = null;
  }

  window.__ac_cookieTimer = setInterval(() => {
    try {
      if (window.Game?.ClickCookie) {
        window.Game.ClickCookie();
        return;
      }
      document.getElementById("bigCookie")?.click();
    } catch (_) { /* ignore */ }
  }, ms);
}

function stopCookieClicker() {
  if (window.__ac_cookieTimer) {
    clearInterval(window.__ac_cookieTimer);
    window.__ac_cookieTimer = null;
  }
}

function setCookieInterval(intervalMs) {
  startCookieClicker(intervalMs);
}

// ── Message listener ────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!sender.tab || typeof sender.tab.id !== "number") {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }

      const tabId = sender.tab.id;

      switch (message.type) {
        case "cookie:start":
          await executeInMainWorld(tabId, startCookieClicker, [message.intervalMs]);
          sendResponse({ ok: true });
          break;

        case "cookie:stop":
          await executeInMainWorld(tabId, stopCookieClicker);
          sendResponse({ ok: true });
          break;

        case "cookie:setInterval":
          await executeInMainWorld(tabId, setCookieInterval, [message.intervalMs]);
          sendResponse({ ok: true });
          break;

        default:
          sendResponse({ ok: false, error: "Unknown message type" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message ?? String(err) });
    }
  })();

  return true; // keep message channel open for async response
});
