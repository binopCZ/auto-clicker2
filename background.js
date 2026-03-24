function ccStartInPage(intervalMs) {
  try {
    const ms = Math.max(10, Number(intervalMs) || 50);

    // Stop old timer
    if (window.__ac_cc_timer) {
      clearInterval(window.__ac_cc_timer);
      window.__ac_cc_timer = null;
    }

    // Start new timer
    window.__ac_cc_timer = setInterval(() => {
      try {
        if (window.Game && typeof window.Game.ClickCookie === "function") {
          window.Game.ClickCookie();
          return;
        }
        // fallback
        const el = document.getElementById("bigCookie");
        if (el) el.click();
      } catch (e) {}
    }, ms);
  } catch (e) {}
}

function ccStopInPage() {
  try {
    if (window.__ac_cc_timer) {
      clearInterval(window.__ac_cc_timer);
      window.__ac_cc_timer = null;
    }
  } catch (e) {}
}

async function execInMainWorld(tabId, func, args) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func,
    args
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !sender?.tab?.id) {
        sendResponse({ ok: false, error: "No tab" });
        return;
      }

      const tabId = sender.tab.id;

      if (msg.type === "CC_START") {
        await execInMainWorld(tabId, ccStartInPage, [msg.intervalMs]);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "CC_STOP") {
        await execInMainWorld(tabId, ccStopInPage, []);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "CC_SET_INTERVAL") {
        await execInMainWorld(tabId, ccStartInPage, [msg.intervalMs]);
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message" });
    } catch (e) {
      // Typical: "Cannot access contents of url ... must request permission ..."
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();

  return true;
});
