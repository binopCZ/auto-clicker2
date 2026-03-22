// background.js
// Handles Cookie Clicker integration by executing code in the page's main world.

async function executeInMainWorld(tabId, func, args = []) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args
  });
}

// These functions run in the page context (MAIN world)
function startCookieClicker(intervalMs) {
  try {
    const ms = Math.max(10, Number(intervalMs) || 50);

    if (window.__ac_cookieTimer) {
      clearInterval(window.__ac_cookieTimer);
      window.__ac_cookieTimer = null;
    }

    window.__ac_cookieTimer = setInterval(() => {
      try {
        if (window.Game && typeof window.Game.ClickCookie === "function") {
          window.Game.ClickCookie();
          return;
        }
        const bigCookie = document.getElementById("bigCookie");
        if (bigCookie) bigCookie.click();
      } catch (e) {
        // ignore
      }
    }, ms);
  } catch (e) {
    // ignore
  }
}

function stopCookieClicker() {
  try {
    if (window.__ac_cookieTimer) {
      clearInterval(window.__ac_cookieTimer);
      window.__ac_cookieTimer = null;
    }
  } catch (e) {
    // ignore
  }
}

function setCookieInterval(intervalMs) {
  // Simply restart with a new interval
  startCookieClicker(intervalMs);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (!sender.tab || typeof sender.tab.id !== "number") {
        sendResponse({ ok: false, error: "No active tab" });
        return;
      }

      const tabId = sender.tab.id;

      if (message.type === "cookie:start") {
        await executeInMainWorld(tabId, startCookieClicker, [message.intervalMs]);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "cookie:stop") {
        await executeInMainWorld(tabId, stopCookieClicker);
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "cookie:setInterval") {
        await executeInMainWorld(tabId, setCookieInterval, [message.intervalMs]);
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (err) {
      sendResponse({
        ok: false,
        error: err && err.message ? err.message : String(err)
      });
    }
  })();

  // Keep the message channel open for async response
  return true;
});
