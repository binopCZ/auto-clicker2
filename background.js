function ccStartInPage(intervalMs) {
  try {
    const ms = Math.max(10, Number(intervalMs) || 50);

    if (window.__ac_cc_timer) {
      clearInterval(window.__ac_cc_timer);
      window.__ac_cc_timer = null;
    }

    window.__ac_cc_timer = setInterval(() => {
      try {
        if (window.Game && typeof window.Game.ClickCookie === 'function') {
          window.Game.ClickCookie();
          return;
        }
        const el = document.getElementById('bigCookie');
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
    world: 'MAIN',
    func,
    args
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !sender?.tab?.id) {
        sendResponse({ ok: false, error: 'No tab' });
        return;
      }

      const tabId = sender.tab.id;

      if (msg.type === 'CCSTART') {
        await execInMainWorld(tabId, ccStartInPage, [msg.intervalMs]);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'CCSTOP') {
        await execInMainWorld(tabId, ccStopInPage, []);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === 'CCSETINTERVAL') {
        await execInMainWorld(tabId, ccStartInPage, [msg.intervalMs]);
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message' });
    } catch (e) {
      sendResponse({
        ok: false,
        error: String(e && e.message ? e.message : e)
      });
    }
  })();

  return true;
});
