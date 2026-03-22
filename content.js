// content.js
(() => {
  // ----- State -----
  const state = {
    isRunning: false,
    mode: "single",         // "single" | "multi"
    intervalMs: 200,
    jitterEnabled: false,
    jitterRadius: 0,
    maxClicksEnabled: false,
    maxClicks: 0,
    clickCount: 0,

    single: {
      clickSource: "cursor", // "cursor" | "fixed"
      fixedX: 0,
      fixedY: 0,
      positionLocked: false
    },

    multi: {
      targets: [],           // { x, y, intervalMs }
      index: 0,
      timeoutId: null
    },

    shortcuts: {
      startKey: "p",
      stopKey: "e"
    },

    ui: {
      panel: null,
      statusText: null,
      countDisplay: null,
      intervalInput: null,
      startBtn: null,
      stopBtn: null,
      modeTabs: null,
      targetIndicator: null,
      multiList: null,
      removeAllBtn: null,
      multiDefaultIntervalInput: null
    },

    mouse: {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    },

    cookie: {
      active: false,
      isCookiePage: false,
      fixedOnBigCookie: false
    },

    panelActive: false,
    mainTimerId: null
  };

  // ----- Mouse tracking -----
  document.addEventListener("mousemove", e => {
    state.mouse.x = e.clientX;
    state.mouse.y = e.clientY;
  });

  // ----- Helpers -----
  function isCookieClickerPage() {
    return (
      location.hostname === "orteil.dashnet.org" &&
      location.pathname.toLowerCase().includes("cookieclicker")
    );
  }

  state.cookie.isCookiePage = isCookieClickerPage();

  function setStatus(message, color) {
    if (!state.ui.statusText) return;
    state.ui.statusText.textContent = message;
    if (color) {
      state.ui.statusText.style.color = color;
    } else {
      state.ui.statusText.style.color = "var(--ac-accent)";
    }
  }

  function sendCookieMessage(payload, onOk) {
    try {
      chrome.runtime.sendMessage(payload, response => {
        const err = chrome.runtime.lastError;
        if (err || !response || !response.ok) {
          setStatus("Cookie mode blocked – enable site access", "#f97316");
          return;
        }
        if (typeof onOk === "function") onOk();
      });
    } catch (e) {
      setStatus("Cookie mode blocked – enable site access", "#f97316");
    }
  }

  function startCookieMode(intervalMs) {
    if (!state.cookie.isCookiePage) return;
    sendCookieMessage(
      { type: "cookie:start", intervalMs },
      () => {
        state.cookie.active = true;
      }
    );
  }

  function stopCookieMode() {
    if (!state.cookie.isCookiePage) return;
    sendCookieMessage(
      { type: "cookie:stop" },
      () => {
        state.cookie.active = false;
      }
    );
  }

  function updateCookieInterval(intervalMs) {
    if (!state.cookie.isCookiePage || !state.cookie.active) return;
    sendCookieMessage(
      { type: "cookie:setInterval", intervalMs },
      () => {}
    );
  }

  // ----- Target indicator (single) -----
  function ensureTargetIndicator() {
    if (state.ui.targetIndicator) return;
    const el = document.createElement("div");
    el.id = "ac-target-indicator";
    document.body.appendChild(el);
    state.ui.targetIndicator = el;
  }

  function showTargetIndicator(x, y) {
    ensureTargetIndicator();
    state.ui.targetIndicator.style.display = "block";
    state.ui.targetIndicator.style.left = `${x}px`;
    state.ui.targetIndicator.style.top  = `${y}px`;
  }

  function hideTargetIndicator() {
    if (!state.ui.targetIndicator) return;
    state.ui.targetIndicator.style.display = "none";
  }

  // ----- Detect element at point -----
  function getClickableElementAt(x, y) {
    const els = document.elementsFromPoint(x, y);
    if (!els || !els.length) return null;

    // Pass 1: obvious clickable elements
    for (const el of els) {
      if (!el) continue;
      if (el.id === "ac-panel" || el.closest?.("#ac-panel")) continue;
      if (el.id === "ac-target-indicator") continue;
      const tag = el.tagName;
      if (["BUTTON", "A"].includes(tag)) return el;
      if (tag === "INPUT") {
        const type = el.type && el.type.toLowerCase();
        if (["button", "submit", "checkbox", "radio"].includes(type)) {
          return el;
        }
      }
      if (typeof el.onclick === "function") return el;
      if (el.getAttribute?.("role") === "button") return el;
    }

    // Pass 2: any element (fallback)
    for (const el of els) {
      if (!el) continue;
      if (el.id === "ac-panel" || el.closest?.("#ac-panel")) continue;
      if (el.id === "ac-target-indicator") continue;
      return el;
    }

    return null;
  }

  function dispatchSyntheticClick(el, x, y) {
    if (!el) return;

    const baseProps = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: 1
    };

    try {
      el.dispatchEvent(new PointerEvent("pointerdown", {
        ...baseProps,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse"
      }));
      el.dispatchEvent(new MouseEvent("mousedown", baseProps));
      el.dispatchEvent(new PointerEvent("pointerup", {
        ...baseProps,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse"
      }));
      el.dispatchEvent(new MouseEvent("mouseup", baseProps));
      el.dispatchEvent(new MouseEvent("click", baseProps));
    } catch (err) {
      try {
        el.click();
      } catch (err2) {
        // ignore
      }
    }
  }

  // ----- Lock / unlock single fixed position -----
  function checkBigCookieAt(x, y) {
    if (!state.cookie.isCookiePage) return false;
    const prevPanelDisplay = state.ui.panel?.style.display;
    const prevIndicator = state.ui.targetIndicator?.style.display;
    if (state.ui.panel) state.ui.panel.style.display = "none";
    if (state.ui.targetIndicator) state.ui.targetIndicator.style.display = "none";

    const els = document.elementsFromPoint(x, y);
    let found = false;
    for (const el of els) {
      if (el && el.id === "bigCookie") {
        found = true;
        break;
      }
    }

    if (state.ui.panel) state.ui.panel.style.display = prevPanelDisplay || "block";
    if (state.ui.targetIndicator) state.ui.targetIndicator.style.display = prevIndicator || "block";

    return found;
  }

  function lockSinglePosition(x, y) {
    state.single.fixedX = x;
    state.single.fixedY = y;
    state.single.positionLocked = true;
    state.cookie.fixedOnBigCookie = checkBigCookieAt(x, y);
    showTargetIndicator(x, y);
    const label = document.getElementById("ac-position-mode-label");
    if (label) label.textContent = "Fixed";
    const startPosBtn = document.getElementById("ac-position-start");
    if (startPosBtn) startPosBtn.disabled = false;
    const resetBtn = document.getElementById("ac-position-reset");
    if (resetBtn) resetBtn.disabled = false;
  }

  function unlockSinglePosition() {
    state.single.positionLocked = false;
    state.cookie.fixedOnBigCookie = false;
    hideTargetIndicator();
    const label = document.getElementById("ac-position-mode-label");
    if (label) label.textContent = "Cursor";
    const startPosBtn = document.getElementById("ac-position-start");
    if (startPosBtn) {
      startPosBtn.disabled = true;
      startPosBtn.classList.remove("ac-pos-btn-active");
      startPosBtn.textContent = "Start fixed position";
    }
    const resetBtn = document.getElementById("ac-position-reset");
    if (resetBtn) resetBtn.disabled = true;
    if (state.isRunning && state.single.clickSource === "fixed") {
      stopClicking();
    }
  }

  // ----- Multi targets -----
  function renderMultiTargets() {
    const list = state.ui.multiList;
    if (!list) return;

    list.innerHTML = "";
    if (!state.multi.targets.length) {
      const empty = document.createElement("div");
      empty.className = "ac-multi-empty";
      empty.textContent = "No targets yet. Click “Add target” and then click anywhere on the page.";
      list.appendChild(empty);
      if (state.ui.removeAllBtn) {
        state.ui.removeAllBtn.style.display = "none";
      }
      if (state.ui.startBtn && state.mode === "multi") {
        state.ui.startBtn.disabled = true;
      }
      return;
    }

    state.multi.targets.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "ac-multi-row";

      const index = document.createElement("span");
      index.className = "ac-multi-index";
      index.textContent = String(i + 1);

      const coords = document.createElement("span");
      coords.className = "ac-multi-coords";
      coords.textContent = `${Math.round(t.x)}, ${Math.round(t.y)}`;

      const input = document.createElement("input");
      input.type = "number";
      input.min = "50";
      input.value = String(t.intervalMs);
      input.className = "ac-multi-interval-input";
      input.addEventListener("change", () => {
        const val = parseInt(input.value, 10);
        t.intervalMs = Math.max(50, isNaN(val) ? state.intervalMs : val);
      });

      const suffix = document.createElement("span");
      suffix.className = "ac-multi-ms";
      suffix.textContent = "ms";

      const removeBtn = document.createElement("button");
      removeBtn.className = "ac-multi-remove";
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove target";
      removeBtn.addEventListener("click", () => {
        removeMultiTarget(i);
      });

      row.appendChild(index);
      row.appendChild(coords);
      row.appendChild(input);
      row.appendChild(suffix);
      row.appendChild(removeBtn);
      list.appendChild(row);
    });

    if (state.ui.removeAllBtn) {
      state.ui.removeAllBtn.style.display = "flex";
    }
    if (state.ui.startBtn && state.mode === "multi") {
      state.ui.startBtn.disabled = state.multi.targets.length === 0;
    }
  }

  function addMultiTarget(x, y, intervalMs) {
    state.multi.targets.push({
      x,
      y,
      intervalMs: intervalMs || state.intervalMs
    });
    renderMultiTargets();
  }

  function clearMultiTargets() {
    state.multi.targets = [];
    renderMultiTargets();
  }

  function removeMultiTarget(index) {
    state.multi.targets.splice(index, 1);
    renderMultiTargets();
  }

  // ----- Click engine -----
  function applyJitter(x, y) {
    if (!state.jitterEnabled || state.jitterRadius <= 0) return { x, y };
    const r = state.jitterRadius;
    const dx = (Math.random() * 2 - 1) * r;
    const dy = (Math.random() * 2 - 1) * r;
    return { x: x + dx, y: y + dy };
  }

  function canContinueClicking() {
    if (!state.maxClicksEnabled) return true;
    return state.clickCount < state.maxClicks;
  }

  function incrementClickCount() {
    state.clickCount += 1;
    if (state.ui.countDisplay) {
      state.ui.countDisplay.textContent = String(state.clickCount);
    }
  }

  function runSingleTick() {
    if (!state.isRunning) return;

    // Cookie Clicker fast mode for bigCookie when fixed
    const canUseCookieMode =
      state.cookie.isCookiePage &&
      state.single.positionLocked &&
      state.single.clickSource === "fixed" &&
      state.cookie.fixedOnBigCookie;

    if (canUseCookieMode) {
      // Counting is handled by us; actual click is done in main world
      if (!state.cookie.active) {
        startCookieMode(state.intervalMs);
      }
      incrementClickCount();
      if (!canContinueClicking()) {
        stopClicking();
      }
      updateCookieInterval(state.intervalMs);
      return;
    }

    if (state.cookie.active) {
      stopCookieMode();
    }

    let x = state.single.clickSource === "fixed"
      ? state.single.fixedX
      : state.mouse.x;
    let y = state.single.clickSource === "fixed"
      ? state.single.fixedY
      : state.mouse.y;

    if (state.single.clickSource === "fixed" && !state.single.positionLocked) {
      // Fixed mode disabled while not locked
      return;
    }

    const jittered = applyJitter(x, y);
    x = jittered.x;
    y = jittered.y;

    const target = getClickableElementAt(x, y);
    if (target) {
      dispatchSyntheticClick(target, x, y);
      incrementClickCount();
      if (!canContinueClicking()) {
        stopClicking();
      }
    }
  }

  function runMultiSequence() {
    if (!state.isRunning) return;
    if (!state.multi.targets.length) {
      stopClicking();
      return;
    }

    const current = state.multi.targets[state.multi.index];
    if (!current) {
      state.multi.index = 0;
      runMultiSequence();
      return;
    }

    const jittered = applyJitter(current.x, current.y);
    const target = getClickableElementAt(jittered.x, jittered.y);
    if (target) {
      dispatchSyntheticClick(target, jittered.x, jittered.y);
      incrementClickCount();
      if (!canContinueClicking()) {
        stopClicking();
        return;
      }
    }

    state.multi.index = (state.multi.index + 1) % state.multi.targets.length;
    state.multi.timeoutId = setTimeout(runMultiSequence, current.intervalMs);
  }

  function startClicking() {
    if (state.isRunning) return;

    // Safety: do not start multi if no targets
    if (state.mode === "multi" && !state.multi.targets.length) {
      setStatus("Add at least one target first", "#f97316");
      return;
    }

    state.isRunning = true;
    state.clickCount = 0;
    if (state.ui.countDisplay) {
      state.ui.countDisplay.textContent = "0";
    }
    if (state.ui.startBtn) state.ui.startBtn.disabled = true;
    if (state.ui.stopBtn)  state.ui.stopBtn.disabled  = false;

    if (state.mode === "single") {
      setStatus(
        state.single.clickSource === "fixed" ? "Running (fixed position)" : "Running…",
        "#22c55e"
      );
      state.mainTimerId = setInterval(runSingleTick, state.intervalMs);
    } else {
      setStatus("Running multi-target…", "#22c55e");
      state.multi.index = 0;
      runMultiSequence();
    }
  }

  function stopClicking() {
    if (!state.isRunning) return;
    state.isRunning = false;
    clearInterval(state.mainTimerId);
    clearTimeout(state.multi.timeoutId);
    state.mainTimerId = null;
    state.multi.timeoutId = null;

    if (state.ui.startBtn) state.ui.startBtn.disabled = false;
    if (state.ui.stopBtn)  state.ui.stopBtn.disabled  = true;

    if (state.cookie.active) {
      stopCookieMode();
    }

    setStatus("Stopped", "#ef4444");
  }

  // ----- Panel UI -----
  function applyThemeToPanel(theme) {
    if (!state.ui.panel) return;
    state.ui.panel.dataset.theme = theme;
  }

  function loadSettingsAndInitTheme() {
    if (!chrome.storage?.sync) {
      applyThemeToPanel("blue");
      return;
    }

    chrome.storage.sync.get(
      {
        ac_theme: "blue",
        ac_mode: "single",
        ac_startKey: "p",
        ac_stopKey: "e",
        ac_intervalMs: 200
      },
      data => {
        applyThemeToPanel(data.ac_theme || "blue");
        switchPanelMode(data.ac_mode || "single");
        state.shortcuts.startKey = (data.ac_startKey || "p").toLowerCase();
        state.shortcuts.stopKey  = (data.ac_stopKey  || "e").toLowerCase();
        state.intervalMs = Math.max(10, Number(data.ac_intervalMs) || 200);

        if (state.ui.intervalInput) {
          state.ui.intervalInput.value = String(state.intervalMs);
        }
        if (state.ui.multiDefaultIntervalInput) {
          state.ui.multiDefaultIntervalInput.value = String(state.intervalMs);
        }
      }
    );
  }

  function switchPanelMode(mode) {
    state.mode = mode === "multi" ? "multi" : "single";

    const singlePanel = document.getElementById("ac-single-panel");
    const multiPanel  = document.getElementById("ac-multi-panel");

    if (singlePanel) {
      singlePanel.style.display = state.mode === "single" ? "block" : "none";
    }
    if (multiPanel) {
      multiPanel.style.display = state.mode === "multi" ? "block" : "none";
    }

    if (state.ui.panel) {
      state.ui.panel
        .querySelectorAll("[data-ac-mode-tab]")
        .forEach(btn => {
          btn.classList.toggle(
            "ac-mode-tab-active",
            btn.dataset.acModeTab === state.mode
          );
        });
    }

    const countSingle = document.getElementById("ac-click-count-single");
    const countMulti  = document.getElementById("ac-click-count-multi");
    state.ui.countDisplay = state.mode === "multi" ? countMulti : countSingle;

    if (state.ui.startBtn) {
      if (state.mode === "multi") {
        state.ui.startBtn.disabled = !state.multi.targets.length;
      } else {
        state.ui.startBtn.disabled = false;
      }
    }

    chrome.storage?.sync?.set({ ac_mode: state.mode });
  }

  function createPanel(initialMode) {
    if (state.ui.panel) {
      state.ui.panel.style.display = "block";
      state.panelActive = true;
      switchPanelMode(initialMode || state.mode);
      return;
    }

    state.mode = initialMode || "single";

    const panel = document.createElement("div");
    panel.id = "ac-panel";
    panel.innerHTML = `
      <div id="ac-header">
        <div id="ac-title">
          <span id="ac-title-icon">●</span>
          <span id="ac-title-text">AUTO CLICKER</span>
        </div>
        <div id="ac-header-right">
          <button id="ac-theme-toggle" type="button" title="Toggle theme"></button>
          <button id="ac-close" type="button" title="Close panel">×</button>
        </div>
      </div>

      <div id="ac-body">
        <div id="ac-status-row">
          <span id="ac-status-label">Status</span>
          <span id="ac-status-text">Ready</span>
        </div>

        <div id="ac-mode-tabs">
          <button data-ac-mode-tab="single" class="ac-mode-tab">Single</button>
          <button data-ac-mode-tab="multi"  class="ac-mode-tab">Multi</button>
        </div>

        <div id="ac-single-panel">
          <div id="ac-position-row">
            <div id="ac-position-info">
              <button id="ac-target" type="button" title="Drag or click to pick a fixed position"></button>
              <div>
                <div id="ac-position-label">Position</div>
                <div id="ac-position-mode-label">Cursor</div>
              </div>
            </div>
            <button id="ac-position-reset" type="button" disabled title="Reset fixed position">↺</button>
          </div>

          <button id="ac-position-start" class="ac-pos-btn" type="button" disabled>
            Start fixed position
          </button>

          <div class="ac-row">
            <span class="ac-row-label">Clicks</span>
            <span id="ac-click-count-single" class="ac-count">0</span>
          </div>

          <div class="ac-row ac-row-inline">
            <span class="ac-row-label">Interval</span>
            <input id="ac-interval" type="number" min="10" value="200">
            <span class="ac-row-suffix">ms</span>
          </div>

          <div class="ac-row ac-row-inline">
            <span class="ac-row-label">Max clicks</span>
            <label class="ac-toggle">
              <input id="ac-max-clicks-enabled" type="checkbox">
              <span class="ac-toggle-slider"></span>
            </label>
            <input id="ac-max-clicks" type="number" min="1" value="1000">
          </div>

          <div class="ac-row ac-row-inline">
            <span class="ac-row-label">Jitter</span>
            <label class="ac-toggle">
              <input id="ac-jitter-enabled" type="checkbox">
              <span class="ac-toggle-slider"></span>
            </label>
            <input id="ac-jitter-radius" type="number" min="0" value="0">
            <span class="ac-row-suffix">px</span>
          </div>
        </div>

        <div id="ac-multi-panel">
          <div class="ac-row">
            <span class="ac-row-label">Clicks</span>
            <span id="ac-click-count-multi" class="ac-count">0</span>
          </div>

          <div id="ac-multi-list"></div>

          <div id="ac-multi-actions">
            <button id="ac-multi-add" type="button">Add target</button>
            <button id="ac-multi-remove-all" type="button">Clear all</button>
          </div>

          <div class="ac-row ac-row-inline">
            <span class="ac-row-label">Default ms</span>
            <input id="ac-multi-default-interval" type="number" min="50" value="200">
            <span class="ac-row-suffix">ms</span>
          </div>
        </div>

        <div id="ac-controls">
          <button id="ac-start" type="button">Start</button>
          <button id="ac-stop"  type="button" disabled>Stop</button>
        </div>

        <div id="ac-shortcuts">
          <div class="ac-shortcuts-title">Keyboard shortcuts</div>
          <div class="ac-shortcuts-row">
            <span>Start</span>
            <span><kbd>Ctrl</kbd> + <kbd id="ac-start-key-display">P</kbd></span>
          </div>
          <div class="ac-shortcuts-row">
            <span>Stop</span>
            <span><kbd>Ctrl</kbd> + <kbd id="ac-stop-key-display">E</kbd></span>
          </div>
        </div>
      </div>

      <div id="ac-footer">
        <span class="ac-badge">v2.0.0</span>
        <div class="ac-footer-right">
          <span class="ac-brand">BINOP</span>
          <a href="https://binopcz.github.io/autoclicker-web"
             target="_blank" rel="noopener noreferrer">
            Website
          </a>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    state.ui.panel = panel;
    state.panelActive = true;

    // Wire up references
    state.ui.statusText  = document.getElementById("ac-status-text");
    state.ui.intervalInput = document.getElementById("ac-interval");
    state.ui.startBtn    = document.getElementById("ac-start");
    state.ui.stopBtn     = document.getElementById("ac-stop");
    state.ui.multiList   = document.getElementById("ac-multi-list");
    state.ui.removeAllBtn = document.getElementById("ac-multi-remove-all");
    state.ui.multiDefaultIntervalInput =
      document.getElementById("ac-multi-default-interval");

    const countSingle = document.getElementById("ac-click-count-single");
    const countMulti  = document.getElementById("ac-click-count-multi");
    state.ui.countDisplay = initialMode === "multi" ? countMulti : countSingle;

    // Mode tabs
    panel.querySelectorAll("[data-ac-mode-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (state.isRunning) stopClicking();
        switchPanelMode(btn.dataset.acModeTab);
      });
    });

    // Theme toggle
    document.getElementById("ac-theme-toggle").addEventListener("click", () => {
      const next = panel.dataset.theme === "green" ? "blue" : "green";
      applyThemeToPanel(next);
      chrome.storage?.sync?.set({ ac_theme: next });
    });

    // Close
    document.getElementById("ac-close").addEventListener("click", () => {
      stopClicking();
      unlockSinglePosition();
      clearMultiTargets();
      hideTargetIndicator();
      state.panelActive = false;
      panel.style.display = "none";
    });

    // Single: position picking
    const targetBtn   = document.getElementById("ac-target");
    const resetBtn    = document.getElementById("ac-position-reset");
    const posStartBtn = document.getElementById("ac-position-start");

    let pickStartX = 0;
    let pickStartY = 0;
    let pickMoved  = false;
    let lastPickX  = 0;
    let lastPickY  = 0;

    function onPickMove(e) {
      lastPickX = e.clientX;
      lastPickY = e.clientY;
      if (
        Math.abs(lastPickX - pickStartX) > 3 ||
        Math.abs(lastPickY - pickStartY) > 3
      ) {
        pickMoved = true;
      }
      showTargetIndicator(lastPickX, lastPickY);
    }

    function onPickEnd() {
      document.removeEventListener("mousemove", onPickMove, true);
      document.removeEventListener("mouseup", onPickEnd, true);

      if (pickMoved) {
        lockSinglePosition(lastPickX, lastPickY);
      } else {
        if (state.single.positionLocked) {
          unlockSinglePosition();
        } else {
          lockSinglePosition(state.mouse.x, state.mouse.y);
        }
      }
    }

    function startPicking(e) {
      e.preventDefault();
      e.stopPropagation();
      pickStartX = e.clientX;
      pickStartY = e.clientY;
      lastPickX  = pickStartX;
      lastPickY  = pickStartY;
      pickMoved  = false;
      showTargetIndicator(lastPickX, lastPickY);
      document.addEventListener("mousemove", onPickMove, true);
      document.addEventListener("mouseup",   onPickEnd,  true);
    }

    targetBtn.addEventListener("mousedown", startPicking);

    resetBtn.addEventListener("click", () => {
      if (state.isRunning) stopClicking();
      unlockSinglePosition();
    });

    posStartBtn.addEventListener("click", () => {
      if (!state.single.positionLocked) return;
      if (state.isRunning && state.single.clickSource === "fixed") {
        stopClicking();
        return;
      }
      state.single.clickSource = "fixed";
      posStartBtn.classList.add("ac-pos-btn-active");
      posStartBtn.textContent = "Stop fixed position";
      startClicking();
    });

    // Interval changes
    state.ui.intervalInput.addEventListener("change", () => {
      const val = parseInt(state.ui.intervalInput.value, 10);
      state.intervalMs = Math.max(10, isNaN(val) ? 200 : val);
      chrome.storage?.sync?.set({ ac_intervalMs: state.intervalMs });
      updateCookieInterval(state.intervalMs);
    });

    state.ui.multiDefaultIntervalInput.addEventListener("change", () => {
      const val = parseInt(state.ui.multiDefaultIntervalInput.value, 10);
      state.intervalMs = Math.max(50, isNaN(val) ? 200 : val);
      chrome.storage?.sync?.set({ ac_intervalMs: state.intervalMs });
    });

    // Max clicks
    const maxEnabled = document.getElementById("ac-max-clicks-enabled");
    const maxInput   = document.getElementById("ac-max-clicks");
    maxEnabled.addEventListener("change", () => {
      state.maxClicksEnabled = maxEnabled.checked;
    });
    maxInput.addEventListener("change", () => {
      const val = parseInt(maxInput.value, 10);
      state.maxClicks = Math.max(1, isNaN(val) ? 1000 : val);
    });

    // Jitter
    const jitterEnabled = document.getElementById("ac-jitter-enabled");
    const jitterRadius  = document.getElementById("ac-jitter-radius");
    jitterEnabled.addEventListener("change", () => {
      state.jitterEnabled = jitterEnabled.checked;
    });
    jitterRadius.addEventListener("change", () => {
      const val = parseInt(jitterRadius.value, 10);
      state.jitterRadius = Math.max(0, isNaN(val) ? 0 : val);
    });

    // Multi: add / remove / clear
    const addBtn = document.getElementById("ac-multi-add");
    const clearBtn = document.getElementById("ac-multi-remove-all");

    addBtn.addEventListener("click", () => {
      if (state.isRunning) return;
      addBtn.disabled = true;
      addBtn.textContent = "Click on the page (Esc to cancel)…";

      const overlay = document.createElement("div");
      overlay.id = "ac-multi-overlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "2147483646";
      overlay.style.cursor = "crosshair";
      overlay.style.background = "rgba(15,23,42,.15)";
      document.body.appendChild(overlay);

      const cancelOverlay = () => {
        overlay.remove();
        document.removeEventListener("keydown", onKey, true);
        addBtn.disabled = false;
        addBtn.textContent = "Add target";
      };

      const onKey = e => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelOverlay();
        }
      };

      overlay.addEventListener("click", e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        const x = e.clientX;
        const y = e.clientY;
        addMultiTarget(x, y, state.intervalMs);
        cancelOverlay();
      }, { once: true });

      document.addEventListener("keydown", onKey, true);
    });

    clearBtn.addEventListener("click", () => {
      if (state.isRunning) stopClicking();
      clearMultiTargets();
    });

    // Start / Stop buttons
    state.ui.startBtn.addEventListener("click", () => {
      if (state.mode === "single") {
        state.single.clickSource = "cursor";
      }
      startClicking();
    });

    state.ui.stopBtn.addEventListener("click", () => {
      stopClicking();
    });

    // Shortcuts display + editing (simple click-to-change)
    const startKeyDisplay = document.getElementById("ac-start-key-display");
    const stopKeyDisplay  = document.getElementById("ac-stop-key-display");

    function updateShortcutDisplay() {
      startKeyDisplay.textContent = state.shortcuts.startKey.toUpperCase();
      stopKeyDisplay.textContent  = state.shortcuts.stopKey.toUpperCase();
    }

    function editKey(which) {
      const label = which === "start" ? startKeyDisplay : stopKeyDisplay;
      label.textContent = "?";
      const listener = e => {
        e.preventDefault();
        const key = e.key.toLowerCase();
        if (key.length === 1 || key === "p" || key === "e") {
          if (which === "start") {
            state.shortcuts.startKey = key;
            chrome.storage?.sync?.set({ ac_startKey: key });
          } else {
            state.shortcuts.stopKey = key;
            chrome.storage?.sync?.set({ ac_stopKey: key });
          }
          updateShortcutDisplay();
        }
        document.removeEventListener("keydown", listener, true);
      };
      document.addEventListener("keydown", listener, true);
    }

    startKeyDisplay.addEventListener("click", () => editKey("start"));
    stopKeyDisplay .addEventListener("click", () => editKey("stop"));

    // Drag panel by header
    const header = document.getElementById("ac-header");
    let dragStartX = 0;
    let dragStartY = 0;
    let panelStartX = 0;
    let panelStartY = 0;

    function onDragMove(e) {
      e.preventDefault();
      panel.style.left = `${panelStartX + (e.clientX - dragStartX)}px`;
      panel.style.top  = `${panelStartY + (e.clientY - dragStartY)}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.margin = "0";
    }

    function onDragEnd() {
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", onDragEnd);
    }

    header.addEventListener("mousedown", e => {
      if ((e.target).id === "ac-close") return;
      if ((e.target).id === "ac-theme-toggle") return;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = panel.getBoundingClientRect();
      panelStartX = rect.left;
      panelStartY = rect.top;
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
    });

    // Load settings, theme and mode
    loadSettingsAndInitTheme();
    switchPanelMode(initialMode || "single");
    renderMultiTargets();
    updateShortcutDisplay();
  }

  // ----- Keyboard shortcuts -----
  document.addEventListener("keydown", e => {
    if (!state.panelActive) return;
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;

    const key = e.key.toLowerCase();
    if (!e.ctrlKey || e.altKey || e.metaKey) return;

    if (key === state.shortcuts.stopKey && state.isRunning) {
      e.preventDefault();
      stopClicking();
      return;
    }

    if (key === state.shortcuts.startKey && !state.isRunning) {
      e.preventDefault();
      if (state.mode === "single") {
        state.single.clickSource = "cursor";
      }
      startClicking();
    }
  });

  // ----- Message listener for popup -----
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "ac:ping") {
      sendResponse({ ok: true });
      return;
    }
    if (msg && msg.type === "ac:show-panel") {
      createPanel(msg.mode || "single");
      sendResponse({ ok: true });
      return;
    }
  });
})();
