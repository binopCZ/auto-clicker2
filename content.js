// content.js
(() => {
  if (window.__AUTO_CLICKER_V2_APP__) {
    return;
  }
  window.__AUTO_CLICKER_V2_APP__ = true;

  const state = {
    isRunning: false,
    mode: "single",
    intervalMs: 200,
    jitterEnabled: false,
    jitterRadius: 0,
    maxClicksEnabled: false,
    maxClicks: 1000,
    clickCount: 0,

    single: {
      clickSource: "cursor",
      fixedX: 0,
      fixedY: 0,
      positionLocked: false
    },

    multi: {
      targets: [],
      index: 0,
      timeoutId: null
    },

    shortcuts: {
      startKey: "p",
      stopKey: "e"
    },

    mouse: {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    },

    cookie: {
      isCookiePage: false,
      active: false,
      fixedOnBigCookie: false
    },

    ui: {
      panel: null,
      statusText: null,
      statusSub: null,
      countValue: null,
      themeToggle: null,
      targetMode: null,
      targetCoords: null,
      intervalInput: null,
      maxEnabled: null,
      maxClicksInput: null,
      jitterEnabled: null,
      jitterRadiusInput: null,
      multiDefaultIntervalInput: null,
      multiList: null,
      singleView: null,
      multiView: null,
      startKeyDisplay: null,
      stopKeyDisplay: null,
      targetIndicator: null
    },

    picker: {
      overlay: null,
      hint: null,
      onPick: null,
      onMove: null,
      onKeyDown: null
    },

    mainTimerId: null,
    panelActive: false
  };

  document.addEventListener("mousemove", (event) => {
    state.mouse.x = event.clientX;
    state.mouse.y = event.clientY;

    if (state.picker.overlay) {
      state.picker.overlay.style.setProperty("--mx", `${event.clientX}px`);
      state.picker.overlay.style.setProperty("--my", `${event.clientY}px`);
      if (state.picker.hint) {
        state.picker.hint.style.left = `${event.clientX}px`;
        state.picker.hint.style.top = `${event.clientY}px`;
      }
    }
  }, true);

  function isCookieClickerPage() {
    return (
      location.hostname === "orteil.dashnet.org" &&
      location.pathname.toLowerCase().includes("cookieclicker")
    );
  }

  state.cookie.isCookiePage = isCookieClickerPage();

  function normalizeTheme(theme) {
    if (theme === "light" || theme === "dark") return theme;
    if (theme === "blue") return "dark";
    if (theme === "green") return "light";
    return "dark";
  }

  function syncSet(data) {
    chrome.storage?.sync?.set?.(data);
  }

  function setStatus(text, tone = "accent", subtext = "") {
    if (state.ui.statusText) {
      state.ui.statusText.textContent = text;
      state.ui.statusText.dataset.tone = tone;
    }
    if (state.ui.statusSub) {
      state.ui.statusSub.textContent = subtext;
    }
  }

  function updateCountUI() {
    if (state.ui.countValue) {
      state.ui.countValue.textContent = String(state.clickCount);
    }
  }

  function updateTargetUI() {
    if (!state.ui.targetMode || !state.ui.targetCoords) return;

    if (state.single.positionLocked) {
      state.ui.targetMode.textContent = "Fixed target ready";
      state.ui.targetCoords.textContent =
        `${Math.round(state.single.fixedX)}, ${Math.round(state.single.fixedY)}`;
    } else {
      state.ui.targetMode.textContent = "Cursor follows live mouse";
      state.ui.targetCoords.textContent = "No fixed target selected";
    }
  }

  function updateModeButtons() {
    const tabs = state.ui.panel?.querySelectorAll?.("[data-ac-mode]");
    tabs?.forEach((button) => {
      button.classList.toggle("active", button.dataset.acMode === state.mode);
    });

    if (state.ui.singleView) {
      state.ui.singleView.classList.toggle("active", state.mode === "single");
    }
    if (state.ui.multiView) {
      state.ui.multiView.classList.toggle("active", state.mode === "multi");
    }
  }

  function updateActionButtons() {
    if (!state.ui.panel) return;

    const startCursor = document.getElementById("ac-start-cursor");
    const startFixed = document.getElementById("ac-start-fixed");
    const stopSingle = document.getElementById("ac-stop-single");
    const startMulti = document.getElementById("ac-start-multi");
    const stopMulti = document.getElementById("ac-stop-multi");
    const clearFixed = document.getElementById("ac-clear-fixed");

    if (startCursor) startCursor.disabled = state.isRunning;
    if (startFixed) startFixed.disabled = state.isRunning || !state.single.positionLocked;
    if (stopSingle) stopSingle.disabled = !state.isRunning || state.mode !== "single";
    if (startMulti) startMulti.disabled = state.isRunning || state.multi.targets.length === 0;
    if (stopMulti) stopMulti.disabled = !state.isRunning || state.mode !== "multi";
    if (clearFixed) clearFixed.disabled = state.isRunning || !state.single.positionLocked;
  }

  function applyTheme(theme) {
    if (!state.ui.panel) return;
    state.ui.panel.dataset.theme = normalizeTheme(theme);
  }

  function ensureTargetIndicator() {
    if (state.ui.targetIndicator) return;

    const indicator = document.createElement("div");
    indicator.id = "ac-target-indicator";
    document.body.appendChild(indicator);
    state.ui.targetIndicator = indicator;
  }

  function showTargetIndicator(x, y) {
    ensureTargetIndicator();
    state.ui.targetIndicator.style.display = "block";
    state.ui.targetIndicator.style.left = `${x}px`;
    state.ui.targetIndicator.style.top = `${y}px`;
  }

  function hideTargetIndicator() {
    if (!state.ui.targetIndicator) return;
    state.ui.targetIndicator.style.display = "none";
  }

  function temporarilyHideFloatingUi(callback) {
    const panel = state.ui.panel;
    const indicator = state.ui.targetIndicator;
    const prevPanelDisplay = panel?.style.display;
    const prevIndicatorDisplay = indicator?.style.display;

    if (panel) panel.style.display = "none";
    if (indicator) indicator.style.display = "none";

    try {
      return callback();
    } finally {
      if (panel) panel.style.display = prevPanelDisplay || "block";
      if (indicator) indicator.style.display = prevIndicatorDisplay || "none";
    }
  }

  function checkBigCookieAt(x, y) {
    if (!state.cookie.isCookiePage) return false;

    return temporarilyHideFloatingUi(() => {
      const elements = document.elementsFromPoint(x, y);
      return elements.some((element) => element?.id === "bigCookie");
    });
  }

  function sendCookieMessage(payload, onOk) {
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        const err = chrome.runtime.lastError;
        if (err || !response?.ok) {
          setStatus(
            "Cookie mode unavailable",
            "warning",
            "Enable site access for the extension on Cookie Clicker."
          );
          return;
        }
        if (typeof onOk === "function") onOk();
      });
    } catch {
      setStatus(
        "Cookie mode unavailable",
        "warning",
        "Enable site access for the extension on Cookie Clicker."
      );
    }
  }

  function startCookieMode(intervalMs) {
    if (!state.cookie.isCookiePage) return;
    sendCookieMessage({ type: "cookie:start", intervalMs }, () => {
      state.cookie.active = true;
    });
  }

  function stopCookieMode() {
    if (!state.cookie.isCookiePage || !state.cookie.active) return;
    sendCookieMessage({ type: "cookie:stop" }, () => {
      state.cookie.active = false;
    });
  }

  function updateCookieInterval(intervalMs) {
    if (!state.cookie.isCookiePage || !state.cookie.active) return;
    sendCookieMessage({ type: "cookie:setInterval", intervalMs }, () => {});
  }

  function getClickableElementAt(x, y) {
    return temporarilyHideFloatingUi(() => {
      const elements = document.elementsFromPoint(x, y);
      if (!elements?.length) return null;

      for (const el of elements) {
        if (!el) continue;
        if (el.id === "ac-target-indicator") continue;

        const tag = el.tagName;
        if (tag === "BUTTON" || tag === "A") return el;

        if (tag === "INPUT") {
          const type = String(el.type || "").toLowerCase();
          if (["button", "submit", "checkbox", "radio"].includes(type)) return el;
        }

        if (typeof el.onclick === "function") return el;
        if (el.getAttribute?.("role") === "button") return el;
      }

      for (const el of elements) {
        if (el) return el;
      }

      return null;
    });
  }

  function dispatchSyntheticClick(element, x, y) {
    if (!element) return false;

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
      element.dispatchEvent(new PointerEvent("pointerdown", {
        ...baseProps,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      }));
      element.dispatchEvent(new MouseEvent("mousedown", baseProps));
      element.dispatchEvent(new PointerEvent("pointerup", {
        ...baseProps,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      }));
      element.dispatchEvent(new MouseEvent("mouseup", baseProps));
      element.dispatchEvent(new MouseEvent("click", baseProps));
      return true;
    } catch {
      try {
        element.click();
        return true;
      } catch {
        return false;
      }
    }
  }

  function applyJitter(x, y) {
    if (!state.jitterEnabled || state.jitterRadius <= 0) {
      return { x, y };
    }

    const dx = (Math.random() * 2 - 1) * state.jitterRadius;
    const dy = (Math.random() * 2 - 1) * state.jitterRadius;
    return { x: x + dx, y: y + dy };
  }

  function canContinueClicking() {
    if (!state.maxClicksEnabled) return true;
    return state.clickCount < state.maxClicks;
  }

  function incrementClickCount() {
    state.clickCount += 1;
    updateCountUI();
  }

  function clickAtPoint(x, y) {
    const target = getClickableElementAt(x, y);
    if (!target) return false;

    const clicked = dispatchSyntheticClick(target, x, y);
    if (!clicked) return false;

    incrementClickCount();

    if (!canContinueClicking()) {
      stopClicking();
    }

    return true;
  }

  function lockFixedPosition(x, y) {
    state.single.fixedX = x;
    state.single.fixedY = y;
    state.single.positionLocked = true;
    state.single.clickSource = "fixed";
    state.cookie.fixedOnBigCookie = checkBigCookieAt(x, y);

    showTargetIndicator(x, y);
    updateTargetUI();
    updateActionButtons();

    setStatus(
      "Fixed target armed",
      "accent",
      state.cookie.fixedOnBigCookie
        ? "Detected Cookie Clicker big cookie fast mode."
        : "Ready to click a saved page position."
    );
  }

  function clearFixedPosition() {
    state.single.positionLocked = false;
    state.single.fixedX = 0;
    state.single.fixedY = 0;
    state.single.clickSource = "cursor";
    state.cookie.fixedOnBigCookie = false;

    hideTargetIndicator();
    updateTargetUI();
    updateActionButtons();

    if (!state.isRunning) {
      setStatus("Ready", "accent", "Pick a fixed target or start cursor mode.");
    }
  }

  function renderMultiTargets() {
    const list = state.ui.multiList;
    if (!list) return;

    list.innerHTML = "";

    if (!state.multi.targets.length) {
      const empty = document.createElement("div");
      empty.className = "ac-empty";
      empty.textContent = "No targets yet. Click Add Target and choose points on the page.";
      list.appendChild(empty);
      updateActionButtons();
      return;
    }

    state.multi.targets.forEach((target, index) => {
      const row = document.createElement("div");
      row.className = "ac-target-row";

      const badge = document.createElement("div");
      badge.className = "ac-target-index";
      badge.textContent = String(index + 1);

      const meta = document.createElement("div");
      meta.className = "ac-target-meta";

      const pos = document.createElement("div");
      pos.className = "ac-target-pos";
      pos.textContent = `${Math.round(target.x)}, ${Math.round(target.y)}`;

      const note = document.createElement("div");
      note.className = "ac-target-note";
      note.textContent = "Per-target interval";

      meta.appendChild(pos);
      meta.appendChild(note);

      const intervalInput = document.createElement("input");
      intervalInput.className = "ac-list-input";
      intervalInput.type = "number";
      intervalInput.min = "50";
      intervalInput.value = String(target.intervalMs);
      intervalInput.addEventListener("change", () => {
        const value = parseInt(intervalInput.value, 10);
        target.intervalMs = Math.max(50, Number.isNaN(value) ? state.intervalMs : value);
      });

      const unit = document.createElement("span");
      unit.className = "ac-unit";
      unit.textContent = "ms";

      const removeBtn = document.createElement("button");
      removeBtn.className = "ac-remove-btn";
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove target";
      removeBtn.addEventListener("click", () => {
        state.multi.targets.splice(index, 1);
        renderMultiTargets();
      });

      row.appendChild(badge);
      row.appendChild(meta);
      row.appendChild(intervalInput);
      row.appendChild(unit);
      row.appendChild(removeBtn);

      list.appendChild(row);
    });

    updateActionButtons();
  }

  function addMultiTarget(x, y, intervalMs) {
    state.multi.targets.push({
      x,
      y,
      intervalMs: Math.max(50, intervalMs || state.intervalMs)
    });
    renderMultiTargets();
    setStatus("Target added", "accent", "Multi sequence can start immediately.");
  }

  function clearMultiTargets() {
    state.multi.targets = [];
    state.multi.index = 0;
    renderMultiTargets();
    setStatus("Targets cleared", "warning", "Add new targets to run multi mode.");
  }

  function switchMode(mode) {
    state.mode = mode === "multi" ? "multi" : "single";
    updateModeButtons();
    updateActionButtons();
    syncSet({ ac_mode: state.mode });

    if (!state.isRunning) {
      setStatus(
        state.mode === "single" ? "Ready" : "Multi mode ready",
        "accent",
        state.mode === "single"
          ? "Pick a fixed target or start cursor mode."
          : "Create a sequence of saved click points."
      );
    }
  }

  function restartSingleLoopIfNeeded() {
    if (!state.isRunning || state.mode !== "single") return;

    if (state.cookie.active) {
      updateCookieInterval(state.intervalMs);
      return;
    }

    clearInterval(state.mainTimerId);
    state.mainTimerId = setInterval(runSingleTick, state.intervalMs);
  }

  function runSingleTick() {
    if (!state.isRunning) return;

    const canUseCookieFastMode =
      state.cookie.isCookiePage &&
      state.single.clickSource === "fixed" &&
      state.single.positionLocked &&
      state.cookie.fixedOnBigCookie;

    if (canUseCookieFastMode) {
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

    let x = state.single.clickSource === "fixed" ? state.single.fixedX : state.mouse.x;
    let y = state.single.clickSource === "fixed" ? state.single.fixedY : state.mouse.y;

    if (state.single.clickSource === "fixed" && !state.single.positionLocked) {
      stopClicking();
      setStatus("No fixed target", "warning", "Pick a saved position first.");
      return;
    }

    const jittered = applyJitter(x, y);
    clickAtPoint(jittered.x, jittered.y);
  }

  function runMultiSequence() {
    if (!state.isRunning) return;

    if (!state.multi.targets.length) {
      stopClicking();
      setStatus("No targets", "warning", "Add at least one target for multi mode.");
      return;
    }

    const current = state.multi.targets[state.multi.index];
    if (!current) {
      state.multi.index = 0;
      state.multi.timeoutId = setTimeout(runMultiSequence, 0);
      return;
    }

    const jittered = applyJitter(current.x, current.y);
    clickAtPoint(jittered.x, jittered.y);

    if (!state.isRunning) return;

    state.multi.index = (state.multi.index + 1) % state.multi.targets.length;
    state.multi.timeoutId = setTimeout(
      runMultiSequence,
      Math.max(50, current.intervalMs || state.intervalMs)
    );
  }

  function startClicking(mode = state.mode, source = "cursor") {
    if (state.isRunning) return;

    if (mode === "single" && source === "fixed" && !state.single.positionLocked) {
      setStatus("Pick a fixed target first", "warning", "Use Add Fixed Target before starting.");
      return;
    }

    if (mode === "multi" && state.multi.targets.length === 0) {
      setStatus("No targets added", "warning", "Create at least one target for multi mode.");
      return;
    }

    state.mode = mode;
    state.single.clickSource = source;
    state.isRunning = true;
    state.clickCount = 0;
    updateCountUI();
    updateModeButtons();
    updateActionButtons();

    if (mode === "single") {
      setStatus(
        source === "fixed" ? "Running fixed mode" : "Running cursor mode",
        "success",
        source === "fixed"
          ? "Clicking the saved target position."
          : "Clicking under the current mouse cursor."
      );
      clearInterval(state.mainTimerId);
      state.mainTimerId = setInterval(runSingleTick, state.intervalMs);
      return;
    }

    setStatus("Running multi sequence", "success", "Cycling through saved targets.");
    state.multi.index = 0;
    runMultiSequence();
  }

  function stopClicking() {
    if (!state.isRunning && !state.cookie.active) return;

    state.isRunning = false;

    clearInterval(state.mainTimerId);
    clearTimeout(state.multi.timeoutId);
    state.mainTimerId = null;
    state.multi.timeoutId = null;

    if (state.cookie.active) {
      stopCookieMode();
    }

    updateActionButtons();
    setStatus("Stopped", "danger", "Clicking has been paused.");
  }

  function closePicker() {
    if (state.picker.overlay) {
      state.picker.overlay.remove();
      state.picker.overlay = null;
    }
    if (state.picker.hint) {
      state.picker.hint.remove();
      state.picker.hint = null;
    }
    if (state.picker.onMove) {
      document.removeEventListener("mousemove", state.picker.onMove, true);
      state.picker.onMove = null;
    }
    if (state.picker.onKeyDown) {
      document.removeEventListener("keydown", state.picker.onKeyDown, true);
      state.picker.onKeyDown = null;
    }
    state.picker.onPick = null;
  }

  function openPicker(label, onPick) {
    closePicker();

    const overlay = document.createElement("div");
    overlay.id = "ac-picker-overlay";

    const hint = document.createElement("div");
    hint.id = "ac-picker-hint";
    hint.textContent = label;

    state.picker.overlay = overlay;
    state.picker.hint = hint;
    state.picker.onPick = onPick;

    document.body.appendChild(overlay);
    document.body.appendChild(hint);

    const handleMove = (event) => {
      overlay.style.setProperty("--mx", `${event.clientX}px`);
      overlay.style.setProperty("--my", `${event.clientY}px`);
      hint.style.left = `${event.clientX}px`;
      hint.style.top = `${event.clientY}px`;
    };

    const handleKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
        setStatus("Selection cancelled", "warning", "No position was saved.");
      }
    };

    state.picker.onMove = handleMove;
    state.picker.onKeyDown = handleKey;

    document.addEventListener("mousemove", handleMove, true);
    document.addEventListener("keydown", handleKey, true);

    overlay.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      const x = event.clientX;
      const y = event.clientY;

      closePicker();
      onPick(x, y);
    }, { once: true });
  }

  function editShortcut(which) {
    const targetEl =
      which === "start" ? state.ui.startKeyDisplay : state.ui.stopKeyDisplay;

    if (!targetEl) return;

    targetEl.textContent = "?";

    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();

      const key = String(event.key || "").toLowerCase();
      if (!key || key.length !== 1) return;

      if (which === "start") {
        state.shortcuts.startKey = key;
        syncSet({ ac_startKey: key });
      } else {
        state.shortcuts.stopKey = key;
        syncSet({ ac_stopKey: key });
      }

      updateShortcutDisplays();
      document.removeEventListener("keydown", onKey, true);
      setStatus("Shortcut updated", "accent", `Ctrl + ${key.toUpperCase()} saved.`);
    };

    document.addEventListener("keydown", onKey, true);
  }

  function updateShortcutDisplays() {
    if (state.ui.startKeyDisplay) {
      state.ui.startKeyDisplay.textContent = state.shortcuts.startKey.toUpperCase();
    }
    if (state.ui.stopKeyDisplay) {
      state.ui.stopKeyDisplay.textContent = state.shortcuts.stopKey.toUpperCase();
    }
  }

  function enableDragging(panel, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let panelX = 0;
    let panelY = 0;

    const onMove = (event) => {
      if (!dragging) return;

      const nextX = panelX + (event.clientX - startX);
      const nextY = panelY + (event.clientY - startY);

      panel.style.left = `${nextX}px`;
      panel.style.top = `${nextY}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    };

    const onUp = () => {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    handle.addEventListener("mousedown", (event) => {
      const target = event.target;
      if (target.closest("button")) return;
      if (target.closest("a")) return;
      if (state.picker.overlay) return;

      dragging = true;
      startX = event.clientX;
      startY = event.clientY;

      const rect = panel.getBoundingClientRect();
      panelX = rect.left;
      panelY = rect.top;

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function bindPanelEvents() {
    const panel = state.ui.panel;

    document.getElementById("ac-theme-toggle").addEventListener("click", () => {
      const current = normalizeTheme(panel.dataset.theme);
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      syncSet({ ac_theme: next });
    });

    document.getElementById("ac-close").addEventListener("click", () => {
      stopClicking();
      closePicker();
      panel.style.display = "none";
      state.panelActive = false;
    });

    panel.querySelectorAll("[data-ac-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        if (state.isRunning) stopClicking();
        switchMode(button.dataset.acMode);
      });
    });

    document.getElementById("ac-pick-fixed").addEventListener("click", () => {
      if (state.isRunning) return;
      openPicker("Click anywhere to save fixed target", (x, y) => {
        lockFixedPosition(x, y);
      });
    });

    document.getElementById("ac-clear-fixed").addEventListener("click", () => {
      if (state.isRunning) return;
      clearFixedPosition();
    });

    document.getElementById("ac-start-cursor").addEventListener("click", () => {
      startClicking("single", "cursor");
    });

    document.getElementById("ac-start-fixed").addEventListener("click", () => {
      startClicking("single", "fixed");
    });

    document.getElementById("ac-stop-single").addEventListener("click", () => {
      stopClicking();
    });

    document.getElementById("ac-multi-add").addEventListener("click", () => {
      if (state.isRunning) return;
      openPicker("Click page to add multi target", (x, y) => {
        addMultiTarget(x, y, state.intervalMs);
      });
    });

    document.getElementById("ac-multi-clear").addEventListener("click", () => {
      if (state.isRunning) return;
      clearMultiTargets();
    });

    document.getElementById("ac-start-multi").addEventListener("click", () => {
      startClicking("multi");
    });

    document.getElementById("ac-stop-multi").addEventListener("click", () => {
      stopClicking();
    });

    state.ui.intervalInput.addEventListener("change", () => {
      const value = parseInt(state.ui.intervalInput.value, 10);
      state.intervalMs = Math.max(10, Number.isNaN(value) ? 200 : value);
      syncSet({ ac_intervalMs: state.intervalMs });
      restartSingleLoopIfNeeded();
    });

    state.ui.multiDefaultIntervalInput.addEventListener("change", () => {
      const value = parseInt(state.ui.multiDefaultIntervalInput.value, 10);
      state.intervalMs = Math.max(50, Number.isNaN(value) ? 200 : value);
      syncSet({ ac_intervalMs: state.intervalMs });
    });

    state.ui.maxEnabled.addEventListener("change", () => {
      state.maxClicksEnabled = state.ui.maxEnabled.checked;
    });

    state.ui.maxClicksInput.addEventListener("change", () => {
      const value = parseInt(state.ui.maxClicksInput.value, 10);
      state.maxClicks = Math.max(1, Number.isNaN(value) ? 1000 : value);
    });

    state.ui.jitterEnabled.addEventListener("change", () => {
      state.jitterEnabled = state.ui.jitterEnabled.checked;
    });

    state.ui.jitterRadiusInput.addEventListener("change", () => {
      const value = parseInt(state.ui.jitterRadiusInput.value, 10);
      state.jitterRadius = Math.max(0, Number.isNaN(value) ? 0 : value);
    });

    state.ui.startKeyDisplay.addEventListener("click", () => editShortcut("start"));
    state.ui.stopKeyDisplay.addEventListener("click", () => editShortcut("stop"));

    enableDragging(panel, document.getElementById("ac-header"));
  }

  function loadSettings() {
    chrome.storage?.sync?.get?.(
      {
        ac_theme: "dark",
        ac_mode: "single",
        ac_startKey: "p",
        ac_stopKey: "e",
        ac_intervalMs: 200
      },
      (data) => {
        applyTheme(data.ac_theme);
        state.mode = data.ac_mode === "multi" ? "multi" : "single";
        state.shortcuts.startKey = String(data.ac_startKey || "p").toLowerCase();
        state.shortcuts.stopKey = String(data.ac_stopKey || "e").toLowerCase();
        state.intervalMs = Math.max(10, Number(data.ac_intervalMs) || 200);

        if (state.ui.intervalInput) {
          state.ui.intervalInput.value = String(state.intervalMs);
        }
        if (state.ui.multiDefaultIntervalInput) {
          state.ui.multiDefaultIntervalInput.value = String(Math.max(50, state.intervalMs));
        }

        updateShortcutDisplays();
        updateTargetUI();
        renderMultiTargets();
        switchMode(state.mode);
      }
    );
  }

  function buildPanel(initialMode) {
    if (state.ui.panel) {
      state.ui.panel.style.display = "block";
      state.panelActive = true;
      switchMode(initialMode || state.mode);
      return;
    }

    const panel = document.createElement("div");
    panel.id = "ac-panel";
    panel.dataset.theme = "dark";

    panel.innerHTML = `
      <div id="ac-shell">
        <div id="ac-header">
          <div id="ac-brand">
            <div id="ac-brand-badge">
              <svg id="ac-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M12 7v5l3 2"></path>
              </svg>
            </div>
            <div id="ac-brand-texts">
              <div id="ac-brand-title">Auto Clicker</div>
              <div id="ac-brand-subtitle">Floating control app · v2.0.0</div>
            </div>
          </div>

          <div id="ac-header-actions">
            <button id="ac-theme-toggle" class="ac-icon-btn" type="button" title="Toggle theme">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3a1 1 0 0 1 1 1v1"></path>
                <path d="M12 19v1a1 1 0 0 0 1 1"></path>
                <path d="M4.22 4.22l.7.7"></path>
                <path d="M18.36 18.36l.7.7"></path>
                <path d="M3 12h1"></path>
                <path d="M19 12h1"></path>
                <path d="M4.22 19.78l.7-.7"></path>
                <path d="M18.36 5.64l.7-.7"></path>
                <circle cx="12" cy="12" r="4"></circle>
              </svg>
            </button>

            <button id="ac-close" class="ac-icon-btn" type="button" title="Close panel">×</button>
          </div>
        </div>

        <div id="ac-body">
          <div id="ac-status-hero">
            <div id="ac-status-copy">
              <div id="ac-status-label">
                <span id="ac-status-dot"></span>
                Activity
              </div>
              <div id="ac-status-text" data-tone="accent">Ready</div>
              <div id="ac-status-sub">Pick a fixed target or start cursor mode.</div>
            </div>

            <div id="ac-count-card">
              <span id="ac-count-value">0</span>
              <span id="ac-count-label">Clicks</span>
            </div>
          </div>

          <div id="ac-mode-switch">
            <button class="ac-tab-btn active" data-ac-mode="single" type="button">Single</button>
            <button class="ac-tab-btn" data-ac-mode="multi" type="button">Multi</button>
          </div>

          <div id="ac-single-view" class="ac-panel-view active">
            <div class="ac-card">
              <div class="ac-card-title">Target</div>
              <div id="ac-target-card">
                <div id="ac-target-copy">
                  <div id="ac-target-mode">Cursor follows live mouse</div>
                  <div id="ac-target-coords">No fixed target selected</div>
                </div>

                <div id="ac-fixed-indicator">
                  <div id="ac-fixed-indicator-core"></div>
                </div>
              </div>

              <div class="ac-btn-row" style="margin-top: 10px;">
                <button id="ac-pick-fixed" class="ac-btn ac-btn-primary" type="button">Add Fixed Target</button>
                <button id="ac-clear-fixed" class="ac-btn ac-btn-ghost" type="button" disabled>Clear</button>
              </div>
            </div>

            <div class="ac-card">
              <div class="ac-card-title">Timing</div>
              <div class="ac-grid">
                <div class="ac-field">
                  <label class="ac-label" for="ac-interval">Interval</label>
                  <div class="ac-input-wrap">
                    <input id="ac-interval" class="ac-inline-input" type="number" min="10" value="200">
                    <span class="ac-unit">ms</span>
                  </div>
                </div>

                <div class="ac-field">
                  <label class="ac-label" for="ac-max-clicks">Max Clicks</label>
                  <div class="ac-input-wrap">
                    <input id="ac-max-clicks" class="ac-inline-input" type="number" min="1" value="1000">
                    <span class="ac-unit">count</span>
                  </div>
                </div>
              </div>

              <div class="ac-toggle-row">
                <div class="ac-toggle-copy">
                  <div class="ac-toggle-title">Limit total clicks</div>
                  <div class="ac-toggle-sub">Stop automatically after the selected count.</div>
                </div>
                <label class="ac-toggle">
                  <input id="ac-max-enabled" type="checkbox">
                  <span class="ac-toggle-slider"></span>
                </label>
              </div>

              <div class="ac-toggle-row">
                <div class="ac-toggle-copy">
                  <div class="ac-toggle-title">Jitter</div>
                  <div class="ac-toggle-sub">Randomize the click point slightly to look less robotic.</div>
                </div>
                <div class="ac-input-wrap">
                  <label class="ac-toggle">
                    <input id="ac-jitter-enabled" type="checkbox">
                    <span class="ac-toggle-slider"></span>
                  </label>
                  <input id="ac-jitter-radius" class="ac-inline-input" type="number" min="0" value="0">
                  <span class="ac-unit">px</span>
                </div>
              </div>
            </div>

            <div class="ac-card">
              <div class="ac-card-title">Actions</div>
              <div id="ac-main-actions">
                <button id="ac-start-cursor" class="ac-btn ac-btn-success" type="button">Start Cursor</button>
                <button id="ac-start-fixed" class="ac-btn ac-btn-primary" type="button" disabled>Start Fixed</button>
                <button id="ac-stop-single" class="ac-btn ac-btn-danger" type="button" disabled>Stop</button>
              </div>
            </div>
          </div>

          <div id="ac-multi-view" class="ac-panel-view">
            <div class="ac-card">
              <div class="ac-card-title">Sequence</div>
              <div id="ac-multi-actions">
                <button id="ac-multi-add" class="ac-btn ac-btn-primary" type="button">Add Target</button>
                <button id="ac-multi-clear" class="ac-btn ac-btn-ghost" type="button">Clear All</button>
              </div>

              <div class="ac-field" style="margin-top: 10px;">
                <label class="ac-label" for="ac-multi-default-interval">Default interval for new targets</label>
                <div class="ac-input-wrap">
                  <input id="ac-multi-default-interval" class="ac-inline-input" type="number" min="50" value="200">
                  <span class="ac-unit">ms</span>
                </div>
              </div>

              <div id="ac-multi-list" style="margin-top: 12px;"></div>
            </div>

            <div class="ac-card">
              <div class="ac-card-title">Actions</div>
              <div id="ac-main-actions">
                <button id="ac-start-multi" class="ac-btn ac-btn-success" type="button" disabled>Start Sequence</button>
                <button id="ac-stop-multi" class="ac-btn ac-btn-danger" type="button" disabled>Stop</button>
              </div>
            </div>
          </div>

          <div id="ac-shortcuts">
            <div id="ac-shortcuts-title">Keyboard Shortcuts</div>

            <div class="ac-shortcut-row">
              <span>Start current mode</span>
              <span class="ac-shortcut-key">
                <kbd>Ctrl</kbd>
                <kbd id="ac-start-key-display">P</kbd>
              </span>
            </div>

            <div class="ac-shortcut-row">
              <span>Stop</span>
              <span class="ac-shortcut-key">
                <kbd>Ctrl</kbd>
                <kbd id="ac-stop-key-display">E</kbd>
              </span>
            </div>
          </div>
        </div>

        <div id="ac-footer">
          <div id="ac-footer-badge">Binop · v2.0.0</div>
          <a href="https://binopcz.github.io/autoclicker-web" target="_blank" rel="noopener noreferrer">Website</a>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    state.ui.panel = panel;
    state.ui.statusText = document.getElementById("ac-status-text");
    state.ui.statusSub = document.getElementById("ac-status-sub");
    state.ui.countValue = document.getElementById("ac-count-value");
    state.ui.themeToggle = document.getElementById("ac-theme-toggle");
    state.ui.targetMode = document.getElementById("ac-target-mode");
    state.ui.targetCoords = document.getElementById("ac-target-coords");
    state.ui.intervalInput = document.getElementById("ac-interval");
    state.ui.maxEnabled = document.getElementById("ac-max-enabled");
    state.ui.maxClicksInput = document.getElementById("ac-max-clicks");
    state.ui.jitterEnabled = document.getElementById("ac-jitter-enabled");
    state.ui.jitterRadiusInput = document.getElementById("ac-jitter-radius");
    state.ui.multiDefaultIntervalInput = document.getElementById("ac-multi-default-interval");
    state.ui.multiList = document.getElementById("ac-multi-list");
    state.ui.singleView = document.getElementById("ac-single-view");
    state.ui.multiView = document.getElementById("ac-multi-view");
    state.ui.startKeyDisplay = document.getElementById("ac-start-key-display");
    state.ui.stopKeyDisplay = document.getElementById("ac-stop-key-display");

    state.panelActive = true;

    bindPanelEvents();
    loadSettings();
    updateCountUI();
    updateTargetUI();
    renderMultiTargets();
    switchMode(initialMode || "single");
  }

  document.addEventListener("keydown", (event) => {
    if (!state.panelActive) return;
    if (!event.ctrlKey || event.altKey || event.metaKey) return;

    const activeTag = document.activeElement?.tagName;
    if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

    const key = String(event.key || "").toLowerCase();

    if (key === state.shortcuts.stopKey) {
      event.preventDefault();
      if (state.isRunning) stopClicking();
      return;
    }

    if (key === state.shortcuts.startKey) {
      event.preventDefault();

      if (state.isRunning) return;

      if (state.mode === "single") {
        const source =
          state.single.positionLocked && state.single.clickSource === "fixed"
            ? "fixed"
            : "cursor";
        startClicking("single", source);
        return;
      }

      startClicking("multi");
    }
  }, true);

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "sync") return;

    if (changes.ac_theme) {
      applyTheme(changes.ac_theme.newValue);
    }

    if (changes.ac_mode && state.ui.panel && !state.isRunning) {
      switchMode(changes.ac_mode.newValue);
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ac:ping") {
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "ac:show-panel") {
      buildPanel(message.mode || "single");
      sendResponse({ ok: true });
      return;
    }
  });
})();
