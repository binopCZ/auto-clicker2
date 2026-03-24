(function () {
  let isRunning = false;
  let clickInterval = null;
  let clickCount = 0;
  let intervalMs = 200;

  let stopKey = "e";
  let startKey = "p";

  let panel = null;
  let countDisplay = null;
  let intervalInput = null;
  let startButton = null;
  let stopButton = null;
  let statusText = null;
  let themeToggle = null;
  let panelActive = false;

  // Mouse tracking (mouse mode)
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // Fixed position mode
  let positionLocked = false;
  let fixedX = mouseX;
  let fixedY = mouseY;
  let targetBtn = null;
  let targetIndicator = null;

  let pickStartX = 0;
  let pickStartY = 0;
  let pickMoved = false;
  let lastPickX = 0;
  let lastPickY = 0;

  // "mouse" | "fixed"
  let clickMode = "mouse";

  // Cookie Clicker detection
  const isCookieClicker = location.hostname === "orteil.dashnet.org" && location.pathname.includes("cookieclicker");
  let ccActive = false;
  let isFixedOnBigCookie = false;

  function setStatus(msg, color) {
    if (!statusText) return;
    statusText.textContent = msg;
    if (color) statusText.style.color = color;
  }

  function ccSend(message, onOk) {
    try {
      chrome.runtime.sendMessage(message, (resp) => {
        const err = chrome.runtime.lastError;
        if (err) {
          setStatus("Cookie mode blocked: enable site access", "#f59e0b");
          return;
        }
        if (!resp || !resp.ok) {
          setStatus("Cookie mode blocked: enable site access", "#f59e0b");
          return;
        }
        onOk && onOk();
      });
    } catch (e) {
      setStatus("Cookie mode blocked: enable site access", "#f59e0b");
    }
  }

  function ccStart(ms) {
    if (!isCookieClicker) return;
    ccSend({ type: "CC_START", intervalMs: ms }, () => {
      ccActive = true;
    });
  }

  function ccStop() {
    if (!isCookieClicker) return;
    ccSend({ type: "CC_STOP" }, () => {
      ccActive = false;
    });
  }

  function ccSetInterval(ms) {
    if (!isCookieClicker) return;
    if (!ccActive) return;
    ccSend({ type: "CC_SET_INTERVAL", intervalMs: ms });
  }

  function ensureTargetIndicator() {
    if (targetIndicator) return;
    targetIndicator = document.createElement("div");
    targetIndicator.id = "ac-target-indicator";
    targetIndicator.style.display = "none";
    document.body.appendChild(targetIndicator);
  }

  function moveIndicator(x, y) {
    ensureTargetIndicator();
    targetIndicator.style.left = x + "px";
    targetIndicator.style.top = y + "px";
  }

  function updatePositionLabel() {
    const label = document.getElementById("ac-position-mode");
    if (!label) return;
    label.textContent = positionLocked ? "Fixed" : "Mouse";
  }

  function updatePositionStartState() {
    const btn = document.getElementById("ac-position-start");
    if (!btn) return;
    btn.disabled = !positionLocked;
    if (!positionLocked) {
      btn.classList.remove("active");
      btn.textContent = "Position START";
      return;
    }
    const activeFixed = isRunning && clickMode === "fixed";
    btn.classList.toggle("active", activeFixed);
    btn.textContent = activeFixed ? "Position STOP" : "Position START";
  }

  // Check if we dropped the target on the big cookie
  function checkBigCookie(x, y) {
    if (!isCookieClicker) return false;
    
    // Hide our UI temporarily to see what is underneath
    let prevIndicatorDisplay = "none";
    if (targetIndicator) {
      prevIndicatorDisplay = targetIndicator.style.display;
      targetIndicator.style.display = "none";
    }
    let prevPanelDisplay = "none";
    if (panel) {
      prevPanelDisplay = panel.style.display;
      panel.style.display = "none";
    }

    const els = document.elementsFromPoint(x, y);
    let found = false;
    if (els && els.length) {
      for (const el of els) {
        if (el && el.id === "bigCookie") {
          found = true;
          break;
        }
      }
    }

    // Restore UI
    if (targetIndicator) targetIndicator.style.display = prevIndicatorDisplay;
    if (panel) panel.style.display = prevPanelDisplay;

    return found;
  }

  function lockPosition(x, y) {
    fixedX = x;
    fixedY = y;
    positionLocked = true;
    ensureTargetIndicator();
    targetIndicator.style.display = "block";
    moveIndicator(x, y);
    if (targetBtn) targetBtn.classList.add("active");
    
    isFixedOnBigCookie = checkBigCookie(x, y);

    updatePositionLabel();
    updatePositionStartState();
  }

  function unlockPosition() {
    positionLocked = false;
    isFixedOnBigCookie = false;
    ensureTargetIndicator();
    targetIndicator.style.display = "none";
    if (targetBtn) targetBtn.classList.remove("active");
    updatePositionLabel();
    if (isRunning && clickMode === "fixed") stopClicking();
    if (ccActive) ccStop();
    clickMode = "mouse";
    updatePositionStartState();
  }

  function onPickMove(e) {
    lastPickX = e.clientX;
    lastPickY = e.clientY;
    if (
      Math.abs(lastPickX - pickStartX) > 3 ||
      Math.abs(lastPickY - pickStartY) > 3
    ) {
      pickMoved = true;
    }
    ensureTargetIndicator();
    targetIndicator.style.display = "block";
    moveIndicator(lastPickX, lastPickY);
  }

  function onPickEnd() {
    document.removeEventListener("mousemove", onPickMove, true);
    document.removeEventListener("mouseup", onPickEnd, true);
    if (pickMoved) {
      lockPosition(lastPickX, lastPickY);
      return;
    }
    if (positionLocked) unlockPosition();
    else lockPosition(mouseX, mouseY);
  }

  function startPicking(e) {
    e.preventDefault();
    e.stopPropagation();
    pickStartX = e.clientX;
    pickStartY = e.clientY;
    lastPickX = pickStartX;
    lastPickY = pickStartY;
    pickMoved = false;

    ensureTargetIndicator();
    targetIndicator.style.display = "block";
    moveIndicator(lastPickX, lastPickY);

    document.addEventListener("mousemove", onPickMove, true);
    document.addEventListener("mouseup", onPickEnd, true);
  }

  // Drag panel
  let dragStartX = 0;
  let dragStartY = 0;
  let panelStartX = 0;
  let panelStartY = 0;

  function onDragMove(e) {
    e.preventDefault();
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    panel.style.left = panelStartX + dx + "px";
    panel.style.top = panelStartY + dy + "px";
  }

  function onDragEnd() {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    const header = document.getElementById("ac-header");
    if (header) header.style.cursor = "grab";
  }

  // Theme
  function loadTheme(callback) {
    if (!chrome.storage || !chrome.storage.sync) {
      callback("dark");
      return;
    }
    chrome.storage.sync.get({ acTheme: "dark" }, (data) => {
      callback(data.acTheme || "dark");
    });
  }

  function saveTheme(theme) {
    if (!chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.set({ acTheme: theme });
  }

  function applyTheme(theme) {
    if (!panel) return;
    panel.dataset.theme = theme;
    const hintTitle = document.getElementById("ac-hint-title");
    if (hintTitle) hintTitle.style.color = theme === "dark" ? "#cbd5e1" : "#4b5563";
  }

  // Generic click helpers
  function getClickableAtPoint(x, y) {
    const els = document.elementsFromPoint(x, y);
    if (!els || !els.length) return null;

    for (const el of els) {
      if (!el) continue;
      if (el.id === "ac-target-indicator") continue;
      if (el.id === "ac-panel" || (el.closest && el.closest("#ac-panel"))) continue;
      const tag = el.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT") return el;
      if (typeof el.onclick === "function") return el;
    }
    for (const el of els) {
      if (!el) continue;
      if (el.id === "ac-target-indicator") continue;
      if (el.id === "ac-panel" || (el.closest && el.closest("#ac-panel"))) continue;
      return el;
    }
    return null;
  }

  function dispatchClick(el, x, y) {
    if (!el) return;

    const eventProps = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: 1
    };

    try {
      el.dispatchEvent(new PointerEvent("pointerdown", eventProps));
      el.dispatchEvent(new MouseEvent("mousedown", eventProps));
      
      el.dispatchEvent(new PointerEvent("pointerup", eventProps));
      el.dispatchEvent(new MouseEvent("mouseup", eventProps));
      
      el.dispatchEvent(new MouseEvent("click", eventProps));
    } catch (e) {
      try {
        el.click();
      } catch (e2) {}
    }
  }

  function createPanel() {
    if (panel) {
      panel.style.display = "block";
      panelActive = true;
      updatePositionLabel();
      updatePositionStartState();
      return;
    }

    panel = document.createElement("div");
    panel.id = "ac-panel";

    panel.innerHTML = `
      <div id="ac-header" style="cursor: grab; user-select: none;">
        <div id="ac-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #22c55e;">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 8v4l3 3"></path>
          </svg>
          <span>AUTO CLICKER</span>
        </div>
        <div id="ac-header-right">
          <div id="ac-theme-toggle" role="switch" title="Toggle Theme">
            <div id="ac-theme-knob"></div>
          </div>
          <div id="ac-close" style="cursor: pointer;" title="Close Panel">&times;</div>
        </div>
      </div>

      <div id="ac-body">
        <div id="ac-status-row">
          <div id="ac-status">
            Status:
            <span id="ac-status-text">Ready</span>
          </div>
          <div id="ac-position-control" title="Drag the circle to set fixed click position. Use Position START to click only there.">
            <div id="ac-target"></div>
            <div id="ac-position-text">
              <span id="ac-position-label">Position</span>
              <span id="ac-position-mode">Mouse</span>
            </div>
          </div>
        </div>

        <button id="ac-position-start" class="ac-pos-btn" disabled>Position START</button>

        <div id="ac-count">Clicks: <span id="ac-count-num">0</span></div>

        <div id="ac-speed">
          <input type="number" id="ac-interval" value="200" min="10"> ms
        </div>

        <div id="ac-controls">
          <button id="ac-start">START</button>
          <button id="ac-stop" disabled>STOP</button>
        </div>

        <div id="ac-hint">
          <div id="ac-hint-title" style="font-size: 11px; margin-bottom: 8px; text-align: center; font-weight: 500;">
            Press combination to control clicking
          </div>
          <div style="display: flex; flex-direction: column; align-items: center; gap: 6px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-left: 20px;">
              <span style="font-weight: 600; font-size: 13px; width: 40px; text-align: right;">Start:</span>
              <span style="display: flex; gap: 4px; align-items: center;"><kbd>Ctrl</kbd> + <kbd>P</kbd></span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; margin-left: 20px;">
              <span style="font-weight: 600; font-size: 13px; width: 40px; text-align: right;">Stop:</span>
              <span style="display: flex; gap: 4px; align-items: center;"><kbd>Ctrl</kbd> + <kbd>E</kbd></span>
            </div>
          </div>
        </div>

        <div class="ac-divider"></div>

        <div class="ac-footer">
          <div class="ac-footer-info">
            <span class="ac-badge">v1.1.2</span>
          </div>
          <div class="ac-credits">
            By <span class="ac-brand" style="margin-right: 4px;">BINOP</span>
            ·
            <a href="https://binopcz.github.io/autoclicker-web/" target="_blank" rel="noopener noreferrer" class="ac-footer-link" style="margin-left: 4px;">
              Website
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    panelActive = true;

    statusText = document.getElementById("ac-status-text");
    countDisplay = document.getElementById("ac-count-num");
    intervalInput = document.getElementById("ac-interval");
    startButton = document.getElementById("ac-start");
    stopButton = document.getElementById("ac-stop");
    themeToggle = document.getElementById("ac-theme-toggle");

    const posStartBtn = document.getElementById("ac-position-start");
    const header = document.getElementById("ac-header");
    targetBtn = document.getElementById("ac-target");

    if (targetBtn) {
      targetBtn.addEventListener("mousedown", startPicking);
    }

    loadTheme((t) => {
      applyTheme(t);
    });

    updatePositionLabel();
    updatePositionStartState();

    header.addEventListener("mousedown", (e) => {
      if (e.target && (e.target.id === "ac-close" || e.target.id === "ac-target")) return;
      if (e.target && e.target.closest && e.target.closest("#ac-theme-toggle")) return;

      dragStartX = e.clientX;
      dragStartY = e.clientY;
      const rect = panel.getBoundingClientRect();
      panelStartX = rect.left;
      panelStartY = rect.top;

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = panelStartX + "px";
      panel.style.top = panelStartY + "px";
      panel.style.margin = "0";

      header.style.cursor = "grabbing";

      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
    });

    document.getElementById("ac-close").onclick = () => {
      stopClicking();
      unlockPosition();
      panel.style.display = "none";
      panelActive = false;
    };

    themeToggle.onclick = () => {
      const current = panel.dataset.theme || "dark";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
    };

    startButton.onclick = () => {
      clickMode = "mouse";
      startClicking();
    };

    stopButton.onclick = stopClicking;

    posStartBtn.onclick = () => {
      if (!positionLocked) return;
      if (isRunning && clickMode === "fixed") {
        stopClicking();
        return;
      }
      clickMode = "fixed";
      startClicking();
    };

    intervalInput.onchange = () => {
      intervalMs = parseInt(intervalInput.value) || 200;
      ccSetInterval(intervalMs);
    };
  }

  function startClicking() {
    if (isRunning) return;
    clickCount = 0;
    if (countDisplay) countDisplay.textContent = 0;
    isRunning = true;
    startButton.disabled = true;
    stopButton.disabled = false;

    setStatus(clickMode === "fixed" ? "Running (Position)" : "Running...", "#22c55e");
    updatePositionStartState();

    const useCookieMain = isCookieClicker && clickMode === "fixed" && positionLocked && isFixedOnBigCookie;

    if (useCookieMain) {
      ccStart(intervalMs);
      
      clickInterval = setInterval(() => {
        clickCount++;
        countDisplay.textContent = clickCount;
      }, intervalMs);
      
    } else {
      if (ccActive) ccStop();
      clickInterval = setInterval(() => {
        let x, y;
        if (clickMode === "fixed") {
          if (!positionLocked) return;
          x = fixedX;
          y = fixedY;
        } else {
          x = mouseX;
          y = mouseY;
        }

        const el = getClickableAtPoint(x, y);
        if (!el) return;

        dispatchClick(el, x, y);

        clickCount++;
        countDisplay.textContent = clickCount;
      }, intervalMs);
    }
  }

  function stopClicking() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(clickInterval);
    startButton.disabled = false;
    stopButton.disabled = true;
    setStatus("Stopped", "#ef4444");

    if (ccActive) ccStop();

    updatePositionStartState();
  }

  document.addEventListener("keydown", (e) => {
    if (!panelActive) return;
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) return;

    const key = e.key.toLowerCase();
    if (e.ctrlKey && key === stopKey) {
      if (isRunning) {
        e.preventDefault();
        stopClicking();
      }
    } else if (e.ctrlKey && key === startKey) {
      if (!isRunning) {
        e.preventDefault();
        clickMode = "mouse";
        startClicking();
      }
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.action === "show_panel") {
      createPanel();
    }
  });
})();
