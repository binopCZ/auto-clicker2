document.addEventListener('DOMContentLoaded', () => {
  const openBtn     = document.getElementById('ac-open-btn');
  const modeSingle  = document.getElementById('mode-single');
  const modeMulti   = document.getElementById('mode-multi');
  const themeToggle = document.getElementById('popup-theme-toggle');

  let selectedMode = 'single';

  function applyTheme(theme) {
    document.body.classList.toggle('theme-green', theme === 'green');
  }

  function saveTheme(theme) {
    if (!chrome.storage?.sync) return;
    chrome.storage.sync.set({ acTheme: theme });
  }

  chrome.storage?.sync?.get({ acTheme: 'blue' }, data => {
    applyTheme(data.acTheme);
  });

  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.acTheme) {
        applyTheme(changes.acTheme.newValue);
      }
    });
  }

  themeToggle.addEventListener('click', () => {
    const isGreen = document.body.classList.contains('theme-green');
    const next = isGreen ? 'blue' : 'green';
    applyTheme(next);
    saveTheme(next);
  });

  function setMode(mode) {
    selectedMode = mode;
    modeSingle.classList.toggle('active', mode === 'single');
    modeMulti.classList.toggle('active',  mode === 'multi');
    chrome.storage?.sync?.set({ acMode: mode });
  }

  chrome.storage?.sync?.get({ acMode: 'single' }, data => {
    setMode(data.acMode || 'single');
  });

  modeSingle.addEventListener('click', () => setMode('single'));
  modeMulti.addEventListener('click',  () => setMode('multi'));

  openBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs?.[0]?.id) return;
      const tabId = tabs[0].id;

      chrome.tabs.sendMessage(tabId, { action: 'showpanel', mode: selectedMode }, () => {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript(
            { target: { tabId }, files: ['content.js'] },
            () => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tabId, { action: 'showpanel', mode: selectedMode });
              }, 150);
            }
          );
        }
      });

      window.close();
    });
  });
});


