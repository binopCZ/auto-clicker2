(function () {
  let isRunning = false;
  let clickTimer = null;
  let clickCount = 0;
  let intervalMs = 200;

  // Hotkeys: Alt+P start, Alt+E stop
  let stopKey = "e";
  let startKey = "p";
  const modifierKey = "altKey";

  let host = null;
  let shadowRoot = null;
  let panel = null;
  let countDisplay = null;
  let intervalInput = null;
  let startButton = null;
  let stopButton = null;
  let statusText = null;
  let themeToggle = null;
  let panelActive = false;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;

  let positionLocked = false;
  let fixedX = mouseX;
  let fixedY = mouseY;
  let targetBtn = null;
  let targetIndicator = null;

  let pickStartX = 0, pickStartY = 0, pickMoved = false, lastPickX = 0, lastPickY = 0;

  let clickMode = "mouse"; // "mouse" | "fixed"
  let panelMode = "single"; // "single" | "multi"

  let multiTargets = []; 
  let multiMarkers = [];
  let multiPicking = false;
  let multiIndex = 0;
  let multiOverlay = null;

  const isCookieClicker = location.hostname === "orteil.dashnet.org" && location.pathname.includes("cookieclicker");
  let ccActive = false;
  let isFixedOnBigCookie = false;

  document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (multiPicking && targetIndicator) {
      targetIndicator.style.display = "block";
      moveIndicator(mouseX, mouseY);
    }
  });

  function setStatus(message, color) {
    if (!statusText) return;
    statusText.textContent = message;
    statusText.style.color = color || "";
  }

  function ccSend(message, onOk) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) return;
        if (typeof onOk === "function") onOk();
      });
    } catch (_e) {}
  }

  function ccStart(ms) {
    if (!isCookieClicker) return;
    ccSend({ type: "CC_START", intervalMs: ms }, () => { ccActive = true; });
  }

  function ccStop() {
    if (!isCookieClicker) return;
    ccSend({ type: "CC_STOP" }, () => { ccActive = false; });
  }

  function ccSetInterval(ms) {
    if (!isCookieClicker || !ccActive) return;
    ccSend({ type: "CC_SET_INTERVAL", intervalMs: ms });
  }

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
    if (!panel || !shadowRoot) return;
    panel.setAttribute("data-theme", theme);
  }

  function ensureTargetIndicator() {
    if (targetIndicator) return;
    targetIndicator = document.createElement("div");
    targetIndicator.id = "ac-target-indicator";
    targetIndicator.style.position = "fixed";
    targetIndicator.style.width = "18px";
    targetIndicator.style.height = "18px";
    targetIndicator.style.borderRadius = "999px";
    targetIndicator.style.border = "2px solid rgba(34,197,94,0.95)";
    targetIndicator.style.boxShadow = "0 0 0 5px rgba(34,197,94,0.14), 0 16px 45px rgba(34,197,94,0.10)";
    targetIndicator.style.background = "radial-gradient(circle at 30% 30%, rgba(187,247,208,0.85) 0, rgba(34,197,94,0.22) 55%, rgba(0,0,0,0) 100%)";
    targetIndicator.style.transform = "translate(-50%, -50%)";
    targetIndicator.style.zIndex = "2147483647";
    targetIndicator.style.pointerEvents = "none";
    targetIndicator.style.display = "none";

    const vLine = document.createElement("div");
    vLine.style.position = "absolute"; vLine.style.left = "50%"; vLine.style.top = "50%";
    vLine.style.transform = "translate(-50%, -50%)"; vLine.style.background = "rgba(34,197,94,0.95)";
    vLine.style.width = "2px"; vLine.style.height = "9px"; vLine.style.borderRadius = "999px";
    
    const hLine = document.createElement("div");
    hLine.style.position = "absolute"; hLine.style.left = "50%"; hLine.style.top = "50%";
    hLine.style.transform = "translate(-50%, -50%)"; hLine.style.background = "rgba(34,197,94,0.95)";
    hLine.style.width = "9px"; hLine.style.height = "2px"; hLine.style.borderRadius = "999px";

    targetIndicator.appendChild(vLine);
    targetIndicator.appendChild(hLine);
    document.body.appendChild(targetIndicator);
  }

  function moveIndicator(x, y) {
    ensureTargetIndicator();
    targetIndicator.style.left = x + "px";
    targetIndicator.style.top = y + "px";
  }

  function showSingleIndicator() {
    ensureTargetIndicator();
    if (panelMode === "single" && positionLocked) {
      targetIndicator.style.display = "block";
      moveIndicator(fixedX, fixedY);
    }
  }

  function hideIndicatorIfNotMultiPicking() {
    if (!targetIndicator || multiPicking) return;
    targetIndicator.style.display = "none";
  }

  function updatePositionLabel() {
    if (!shadowRoot) return;
    const label = shadowRoot.getElementById("ac-position-mode");
    if (label) label.textContent = positionLocked ? "Fixed" : "Mouse";
  }

  function updatePositionStartState() {
    if (!shadowRoot) return;
    const button = shadowRoot.getElementById("ac-position-start");
    if (!button) return;
    const activeFixed = isRunning && panelMode === "single" && clickMode === "fixed";
    button.disabled = !positionLocked || panelMode !== "single";
    button.classList.toggle("active", activeFixed);
    
    if (activeFixed) {
      button.innerHTML = `POSITION STOP`;
    } else {
      button.innerHTML = `POSITION START`;
    }
  }

  function checkBigCookie(x, y) {
    if (!isCookieClicker) return false;
    let prevIndicator = "none", prevHost = "block";
    if (targetIndicator) { prevIndicator = targetIndicator.style.display; targetIndicator.style.display = "none"; }
    if (host) { prevHost = host.style.display || "block"; host.style.display = "none"; }

    const elements = document.elementsFromPoint(x, y);
    let found = false;
    if (elements && elements.length) {
      for (const el of elements) {
        if (el && el.id === "bigCookie") { found = true; break; }
      }
    }

    if (targetIndicator) targetIndicator.style.display = prevIndicator;
    if (host) host.style.display = prevHost;
    return found;
  }

  function lockPosition(x, y) {
    fixedX = x; fixedY = y;
    positionLocked = true;
    isFixedOnBigCookie = checkBigCookie(x, y);

    ensureTargetIndicator();
    targetIndicator.style.display = "block";
    moveIndicator(x, y);

    if (targetBtn) targetBtn.classList.add("active");
    updatePositionLabel();
    updatePositionStartState();
  }

  function unlockPosition() {
    positionLocked = false;
    isFixedOnBigCookie = false;

    if (targetBtn) targetBtn.classList.remove("active");
    if (isRunning && panelMode === "single" && clickMode === "fixed") stopClicking();
    if (ccActive) ccStop();

    clickMode = "mouse";
    updatePositionLabel();
    updatePositionStartState();
    hideIndicatorIfNotMultiPicking();
  }

  function onPickMove(e) {
    lastPickX = e.clientX; lastPickY = e.clientY;
    if (Math.abs(lastPickX - pickStartX) > 3 || Math.abs(lastPickY - pickStartY) > 3) pickMoved = true;
    ensureTargetIndicator();
    targetIndicator.style.display = "block";
    moveIndicator(lastPickX, lastPickY);
  }

  function onPickEnd() {
    document.removeEventListener("mousemove", onPickMove, true);
    document.removeEventListener("mouseup", onPickEnd, true);
    if (pickMoved) { lockPosition(lastPickX, lastPickY); return; }
    if (positionLocked) unlockPosition();
    else lockPosition(mouseX, mouseY);
  }

  function startPicking(e) {
    if (panelMode !== "single") return;
    e.preventDefault(); e.stopPropagation();
    pickStartX = e.clientX; pickStartY = e.clientY;
    lastPickX = pickStartX; lastPickY = pickStartY;
    pickMoved = false;

    ensureTargetIndicator();
    targetIndicator.style.display = "block";
    moveIndicator(lastPickX, lastPickY);

    document.addEventListener("mousemove", onPickMove, true);
    document.addEventListener("mouseup", onPickEnd, true);
  }

  function clearMultiMarkers() {
    for (const m of multiMarkers) m.remove();
    multiMarkers = [];
  }

  function renderMultiMarkers() {
    clearMultiMarkers();
    if (!multiTargets.length) return;

    multiTargets.forEach((t, i) => {
      const marker = document.createElement("div");
      marker.className = "ac-multi-marker";
      marker.style.position = "fixed";
      marker.style.left = `${t.x}px`;
      marker.style.top = `${t.y}px`;
      marker.style.width = "18px";
      marker.style.height = "18px";
      marker.style.borderRadius = "999px";
      marker.style.background = "rgba(34, 197, 94, 0.22)";
      marker.style.border = "2px solid rgba(34, 197, 94, 0.9)";
      marker.style.boxShadow = "0 0 0 2px rgba(15, 23, 42, 0.55)";
      marker.style.transform = "translate(-50%, -50%)";
      marker.style.pointerEvents = "none";
      marker.style.zIndex = "2147483646";

      const label = document.createElement("div");
      label.textContent = String(i + 1);
      label.style.position = "absolute";
      label.style.left = "50%";
      label.style.top = "50%";
      label.style.transform = "translate(-50%, -50%)";
      label.style.fontSize = "10px";
      label.style.fontWeight = "800";
      label.style.color = "#ffffff";

      marker.appendChild(label);
      document.body.appendChild(marker);
      multiMarkers.push(marker);
    });
  }

  function addMultiTarget(x, y) {
    const defaultInterval = 200 + multiTargets.length * 100;
    multiTargets.push({ x, y, interval: defaultInterval, repeat: true
      renderMultiTargets();
    renderMultiMarkers();
  }

  function removeMultiTarget(index) {
    multiTargets.splice(index, 1);
    renderMultiTargets();
    renderMultiMarkers();
  }

  function clearMultiTargets() {
    multiTargets = []; multiIndex = 0;
    renderMultiTargets(); renderMultiMarkers();
  }

  function renderMultiTargets() {
    if (!shadowRoot) return;
    const list = shadowRoot.getElementById("ac-multi-list");
    if (!list) return;

    list.innerHTML = "";
    if (!multiTargets.length) {
      const empty = document.createElement("div");
      empty.textContent = "No targets added yet.";
      empty.style.opacity = "0.72";
      empty.style.fontSize = "12px";
      empty.style.textAlign = "center";
      empty.style.padding = "10px 0";
      list.appendChild(empty);
      return;
    }

    multiTargets.forEach((t, i) => {
      const row = document.createElement("div");
      row.className = "ac-multi-row";

      const left = document.createElement("div");
      left.className = "ac-multi-left";

      const line1 = document.createElement("div");
      line1.textContent = `#${i + 1}`;
      line1.className = "ac-multi-index";

      const line2 = document.createElement("div");
      line2.textContent = `X:${Math.round(t.x)} Y:${Math.round(t.y)}`;
      line2.className = "ac-multi-coords";

      left.appendChild(line1); left.appendChild(line2);

      const intervalWrap = document.createElement("div");
      intervalWrap.className = "ac-multi-interval-wrap";

      const intervalInput = document.createElement("input");
      intervalInput.type = "number";
      intervalInput.min = "1";
      intervalInput.value = t.interval;
      intervalInput.id = "ac-multi-interval";

      intervalInput.addEventListener("change", () => {
        const v = parseInt(intervalInput.value, 10);
        multiTargets[i].interval = Number.isFinite(v) && v > 0 ? v : 200;
        intervalInput.value = multiTargets[i].interval;
      });

      const msLabel = document.createElement("span");
      msLabel.textContent = "ms";
      msLabel.className = "ac-multi-ms";

      intervalWrap.appendChild(intervalInput); intervalWrap.appendChild(msLabel);

            const repeatWrap = document.createElement("div");
            repeatWrap.className = "ac-multi-repeat-wrap";
            const repeatCheckbox = document.createElement("input");
            repeatCheckbox.type = "checkbox";
            repeatCheckbox.checked = t.repeat !== false;
            repeatCheckbox.addEventListener("change", () => { multiTargets[i].repeat = repeatCheckbox.checked; });
            const repeatLabel = document.createElement("label");
            repeatLabel.appendChild(repeatCheckbox);
            const repeatText = document.createTextNode(" Opakovat");
            repeatLabel.appendChild(repeatText);
            repeatWrap.appendChild(repeatLabel);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      removeButton.className = "ac-multi-remove";

      removeButton.addEventListener("click", () => { removeMultiTarget(i); });

      row.appendChild(left); row.appendChild(repeatWrap); row.appendChild(intervalWrap); row.appendChild(removeButton);
      list.appendChild(row);
    });
  }

  function ensureMultiOverlay() {
    if (multiOverlay) return;
    multiOverlay = document.createElement("div");
    multiOverlay.id = "ac-multi-overlay";
    multiOverlay.style.position = "fixed";
    multiOverlay.style.inset = "0";
    multiOverlay.style.zIndex = "2147483645";
    multiOverlay.style.background = "rgba(16, 185, 129, 0.08)";
    multiOverlay.style.backdropFilter = "blur(1px)";
    multiOverlay.style.cursor = "crosshair";
    multiOverlay.style.pointerEvents = "auto";

    multiOverlay.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); }, true);
    multiOverlay.addEventListener("mouseup", (e) => { e.preventDefault(); e.stopPropagation(); }, true);
    document.body.appendChild(multiOverlay);
  }

  function showMultiOverlay() { ensureMultiOverlay(); multiOverlay.style.display = "block"; }
  function hideMultiOverlay() { if (multiOverlay) multiOverlay.style.display = "none"; }

  function startMultiPicking() {
    if (isRunning) return;
    multiPicking = true;
    setStatus("Click on the page to add a point", "#f59e0b");
    showMultiOverlay();
    ensureTargetIndicator();
    targetIndicator.style.display = "block";
    moveIndicator(mouseX, mouseY);
  }

  function finishMultiPicking(x, y) {
    multiPicking = false;
    hideMultiOverlay();
    addMultiTarget(x, y);
    hideIndicatorIfNotMultiPicking();
    setStatus("Target added", "#22c55e");
    setTimeout(() => { if (!isRunning) setStatus("Ready", "#22c55e"); }, 800);
  }

  document.addEventListener("mousedown", (e) => {
    if (!multiPicking) return;
    if (host && (e.target === host || host.contains(e.target))) return;
    e.preventDefault(); e.stopPropagation();
    finishMultiPicking(e.clientX, e.clientY);
  }, true);

  function getClickableAtPoint(x, y) {
    const els = document.elementsFromPoint(x, y);
    if (!els || !els.length) return null;
    for (const el of els) {
      if (!el || el.id === "ac-target-indicator" || (el.classList && el.classList.contains("ac-multi-marker"))) continue;
      if (host && (el === host || host.contains(el))) continue;
      const tag = el.tagName;
      if (tag === "BUTTON" || tag === "A" || tag === "INPUT") return el;
      if (typeof el.onclick === "function") return el;
    }
    for (const el of els) {
      if (!el || el.id === "ac-target-indicator" || (el.classList && el.classList.contains("ac-multi-marker"))) continue;
      if (host && (el === host || host.contains(el))) continue;
      return el;
    }
    return null;
  }

  function dispatchClick(el, x, y) {
    if (!el) return;
    const eventProps = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", eventProps));
      el.dispatchEvent(new MouseEvent("mousedown", eventProps));
      el.dispatchEvent(new PointerEvent("pointerup", eventProps));
      el.dispatchEvent(new MouseEvent("mouseup", eventProps));
      el.dispatchEvent(new MouseEvent("click", eventProps));
    } catch (_e) {
      try { el.click(); } catch (_e2) {}
    }
  }

  function runSingleSequence() {
    const useCookieMain = isCookieClicker && clickMode === "fixed" && positionLocked && isFixedOnBigCookie;
    if (useCookieMain) {
      ccStart(intervalMs);
      clickTimer = setInterval(() => { clickCount++; if (countDisplay) countDisplay.textContent = clickCount; }, intervalMs);
      return;
    }
    if (ccActive) ccStop();
    clickTimer = setInterval(() => {
      let x = (clickMode === "fixed" && positionLocked) ? fixedX : mouseX;
      let y = (clickMode === "fixed" && positionLocked) ? fixedY : mouseY;
      const el = getClickableAtPoint(x, y);
      if (el) { dispatchClick(el, x, y); clickCount++; if (countDisplay) countDisplay.textContent = clickCount; }
    }, intervalMs);
  }

  function runMultiSequence() {
    if (ccActive) ccStop();
    if (!multiTargets.length) return;
    multiIndex = 0;

    function scheduleNext() {
      if (!isRunning || !multiTargets.length) return;
      if (multiIndex >= multiTargets.length) multiIndex = 0;
      
      const index = multiIndex;
      const target = multiTargets[index];
      const el = getClickableAtPoint(target.x, target.y);
      if (el) {
        dispatchClick(el, target.x, target.y);
        clickCount++;
        if (countDisplay) countDisplay.textContent = clickCount;
      }

            if (target.repeat === false) {
                      multiTargets.splice(index, 1);
                      renderMultiTargets();
                      renderMultiMarkers();
                    }
      
      const delay = target.interval > 0 ? target.interval : 200;
      multiIndex = (multiIndex + 1) % multiTargets.length;
      clickTimer = setTimeout(scheduleNext, delay);
    }
    scheduleNext();
  }

  function startClicking() {
    if (isRunning) return;
    if (panelMode === "multi" && multiTargets.length === 0) { setStatus("Add at least one target first", "#ef4444"); return; }
    
    clickCount = 0;
    if (countDisplay) countDisplay.textContent = "0";
    isRunning = true;
    if (startButton) startButton.disabled = true;
    if (stopButton) stopButton.disabled = false;

    if (panelMode === "single") {
      setStatus(clickMode === "fixed" ? "Running (Position)" : "Running...", "#22c55e");
      updatePositionStartState();
      runSingleSequence();
    } else {
      setStatus("Running (Multi)...", "#22c55e");
      runMultiSequence();
    }
  }

  function stopClicking() {
    if (!isRunning) return;
    isRunning = false;
    clearTimeout(clickTimer); clearInterval(clickTimer);
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    if (ccActive) ccStop();
    setStatus("Stopped", "#ef4444");
    updatePositionStartState();
  }

  function createHostAndShadow() {
    if (host) return;
    host = document.createElement("div");
    host.id = "ac-shadow-host";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.right = "18px";
    host.style.bottom = "18px";

    shadowRoot = host.attachShadow({ mode: "open" });

    // 100% PŮVODNÍ AURORA GLASS UI PŘEVEDENO DO SHADOW DOM
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      * { box-sizing: border-box; }

      @keyframes ac-aurora {
        to { transform: rotate(360deg); }
      }

      #ac-panel {
        --r: 14px;
        --accent: #22c55e;
        --accent2: #60a5fa;
        --danger: #ef4444;
        --bg0: #050712;
        --bg1: #070a18;
        --surface: rgba(15, 23, 42, .72);
        --surface2: rgba(2, 6, 23, .62);
        --border: rgba(148, 163, 184, .22);
        --border2: rgba(148, 163, 184, .35);
        --text: #e5e7eb;
        --muted: rgba(226, 232, 240, .66);
        --muted2: rgba(226, 232, 240, .44);
        --shadow: 0 22px 60px rgba(0,0,0,.55);

        position: relative;
        width: 320px;
        border-radius: var(--r);
        border: 1px solid var(--border);
        overflow: hidden;
        color: var(--text);
        font-size: 14px;
        background: radial-gradient(900px 450px at -10% -20%, rgba(96,165,250,.22), transparent 55%),
                    radial-gradient(750px 420px at 110% 10%, rgba(34,197,94,.20), transparent 55%),
                    radial-gradient(900px 600px at 40% 120%, rgba(168,85,247,.14), transparent 55%),
                    linear-gradient(180deg, var(--bg1), var(--bg0));
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }

      /* Animated aurora border */
      #ac-panel::before {
        content: "";
        position: absolute;
        inset: -2px;
        border-radius: calc(var(--r) + 2px);
        background: conic-gradient(
          from 180deg,
          rgba(34,197,94,.0),
          rgba(34,197,94,.35),
          rgba(96,165,250,.30),
          rgba(168,85,247,.22),
          rgba(34,197,94,.0)
        );
        filter: blur(10px);
        opacity: .55;
        pointer-events: none;
        animation: ac-aurora 7.5s linear infinite;
        z-index: 0;
      }

      /* Soft grain overlay */
      #ac-panel::after {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: .10;
        mix-blend-mode: overlay;
        background: repeating-linear-gradient(
          0deg, rgba(255,255,255,.02) 0px, rgba(255,255,255,.02) 1px, transparent 1px, transparent 3px
        ),
        repeating-linear-gradient(
          90deg, rgba(255,255,255,.015) 0px, rgba(255,255,255,.015) 1px, transparent 1px, transparent 4px
        );
        z-index: 0;
      }

      #ac-panel[data-theme="light"] {
        --bg0: #f7f7fb;
        --bg1: #ffffff;
        --text: #0b1220;
        --muted: rgba(11, 18, 32, .74);
        --muted2: rgba(11, 18, 32, .56);
        --surface: rgba(255, 255, 255, .92);
        --surface2: rgba(241, 245, 249, .92);
        --border: rgba(15, 23, 42, .14);
        --border2: rgba(15, 23, 42, .20);
        --shadow: 0 22px 55px rgba(15,23,42,.22);
        
        background: radial-gradient(850px 420px at -10% -15%, rgba(96,165,250,.18), transparent 55%),
                    radial-gradient(800px 420px at 115% 5%, rgba(34,197,94,.16), transparent 55%),
                    radial-gradient(800px 520px at 40% 120%, rgba(168,85,247,.10), transparent 55%),
                    linear-gradient(180deg, var(--bg1), var(--bg0));
        box-shadow: var(--shadow);
      }
      #ac-panel[data-theme="light"]::before { opacity: .34; filter: blur(12px); }
      #ac-panel[data-theme="light"]::after { opacity: .04; mix-blend-mode: normal; }

      .content-wrapper { position: relative; z-index: 1; }

      #ac-header {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 16px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(180deg, rgba(2,6,23,.62), rgba(2,6,23,.35));
        cursor: grab;
      }
      #ac-panel[data-theme="light"] #ac-header {
        background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,250,252,.94));
        border-bottom-color: rgba(15,23,42,.10);
      }
      
      #ac-title {
        display: flex; align-items: center; gap: 9px;
        font-weight: 800; font-size: 14px; letter-spacing: .12em; text-transform: uppercase;
        color: var(--text);
      }
      #ac-title svg { color: var(--accent); filter: drop-shadow(0 0 10px rgba(34,197,94,.45)); }
      
      #ac-header-right { display: flex; align-items: center; gap: 10px; }

      #ac-theme-toggle {
        position: relative; width: 44px; height: 24px; border-radius: 20px;
        background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border2);
        cursor: pointer; transition: background-color 0.3s, border-color 0.3s;
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
      }
      #ac-theme-knob {
        position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
        border-radius: 50%; background: #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), background-color 0.3s;
      }
      #ac-panel[data-theme="light"] #ac-theme-toggle {
        background: rgba(34, 197, 94, 0.15); border-color: rgba(34, 197, 94, 0.4);
      }
      #ac-panel[data-theme="light"] #ac-theme-knob {
        transform: translateX(20px); background: #ffffff;
      }

      #ac-close {
        width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
        border-radius: 999px; border: 1px solid var(--border);
        background: rgba(239,68,68,.10); color: var(--danger); cursor: pointer;
        transition: transform .10s, background .18s, border-color .18s;
      }
      #ac-close:hover {
        transform: translateY(-1px); background: rgba(239,68,68,.16); border-color: rgba(239,68,68,.35);
      }

      #ac-body {
        position: relative; padding: 16px;
        background: linear-gradient(180deg, rgba(2,6,23,.12), rgba(2,6,23,.00));
      }
      #ac-panel[data-theme="light"] #ac-body {
        background: linear-gradient(180deg, rgba(255,255,255,.20), rgba(255,255,255,.00));
      }

      #ac-status-row { display: flex; justify-content: space-between; margin-bottom: 12px; }
      #ac-status { font-size: 13px; font-weight: 800; color: var(--muted); }
      #ac-status-text { margin-left: 5px; color: var(--accent); }

      #ac-position-control {
        display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px;
        border-radius: 999px; border: 1px solid var(--border2);
        background: linear-gradient(135deg, rgba(34,197,94,.14), rgba(96,165,250,.10));
        box-shadow: inset 0 1px 0 rgba(255,255,255,.06); user-select: none;
      }
      #ac-panel[data-theme="light"] #ac-position-control { background: linear-gradient(135deg, rgba(34,197,94,.10), rgba(96,165,250,.08)); }
      #ac-position-text { display: flex; flex-direction: column; line-height: 1.05; }
      #ac-position-label { font-size: 10px; font-weight: 900; letter-spacing: .10em; text-transform: uppercase; color: var(--muted2); }
      #ac-position-mode { font-size: 12px; font-weight: 900; letter-spacing: .10em; text-transform: uppercase; color: var(--accent); }

      #ac-target {
        width: 16px; height: 16px; border-radius: 999px; cursor: grab;
        border: 2px solid rgba(34,197,94,.95);
        background: radial-gradient(circle at 30% 30%, #bbf7d0 0, var(--accent) 55%, #166534 100%);
        box-shadow: 0 0 0 3px rgba(34,197,94,.16); transition: transform .12s, box-shadow .18s;
      }

      .ac-pos-btn {
        width: 100%; margin: 12px 0; padding: 12px; border-radius: 12px;
        border: 1px solid var(--border2);
        background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
        color: var(--text); font-size: 13px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
        cursor: pointer; transition: transform .12s, border-color .18s, background .18s, box-shadow .18s;
      }
      #ac-panel[data-theme="light"] .ac-pos-btn { background: linear-gradient(180deg, rgba(255,255,255,.92), rgba(241,245,249,.86)); }
      .ac-pos-btn::before { content:"●"; margin-right: 8px; color: var(--accent); text-shadow: 0 0 10px rgba(34,197,94,.35); }
      .ac-pos-btn:hover:not(:disabled) {
        transform: translateY(-1px); border-color: rgba(34,197,94,.55);
        background: linear-gradient(180deg, rgba(34,197,94,.16), rgba(96,165,250,.10));
        box-shadow: 0 14px 30px rgba(34,197,94,.10);
      }
      .ac-pos-btn:active:not(:disabled) { transform: translateY(0) scale(.99); }
      .ac-pos-btn.active { border-color: rgba(34,197,94,.75); background: linear-gradient(180deg, rgba(34,197,94,.22), rgba(34,197,94,.10)); }

      #ac-multi-view { margin-bottom: 16px; }
      .ac-multi-btn-row { display:flex; gap:10px; margin-bottom:14px; }
      #ac-add-target {
        flex:1; border-radius:12px; border:1px solid rgba(59,130,246,0.5); background:rgba(59,130,246,0.15);
        color:#60a5fa; font-size:13px; font-weight:800; letter-spacing: 0.05em; cursor:pointer; padding:12px 0; transition:all 0.2s;
      }
      #ac-panel[data-theme="light"] #ac-add-target { color: #2563eb; }

      #ac-clear-targets {
        min-width:90px; border-radius:12px; border:1px solid rgba(239,68,68,0.5); background:rgba(239,68,68,0.15);
        color:#f87171; font-size:13px; font-weight:800; letter-spacing: 0.05em; cursor:pointer; padding:12px 0; transition:all 0.2s;
      }
      #ac-panel[data-theme="light"] #ac-clear-targets { color: #dc2626; }

      #ac-multi-list { max-height:160px; overflow-y:auto; padding-right:6px; margin-bottom: 8px;}
      .ac-multi-row {
        display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px;
        margin-bottom:10px; border-radius:12px; background:rgba(15,23,42,0.6); border:1px solid rgba(148,163,184,0.15);
      }
      #ac-panel[data-theme="light"] .ac-multi-row { background:rgba(255,255,255,0.8); border-color:rgba(148,163,184,0.3); }
      
      .ac-multi-left { display:flex; flex-direction:column; gap:6px; min-width:110px; }
      .ac-multi-index { font-weight:800; font-size:14px; color: var(--text); }
      .ac-multi-coords { font-size:12px; opacity:0.6; font-family: ui-monospace, "JetBrains Mono", monospace; color: var(--text); }
      
      .ac-multi-interval-wrap { display:flex; align-items:center; gap:6px; }
      #ac-multi-interval {
        width: 65px; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border2);
        background: var(--surface); color: var(--text); font-size: 13px; font-weight: 700; text-align: center;
      }
      #ac-panel[data-theme="light"] #ac-multi-interval { background: #ffffff; }
      .ac-multi-ms { font-size:12px; opacity:0.6; color: var(--text); }
      
      .ac-multi-remove {
        width: 30px; height: 30px; border-radius:8px; border:1px solid rgba(239,68,68,0.4);
        background:rgba(239,68,68,0.1); color:#ef4444; cursor:pointer; font-size:14px; font-weight:bold;
        display:flex; align-items:center; justify-content:center; transition: all 0.2s;
      }

      #ac-count { font-family: ui-monospace, "JetBrains Mono", monospace; font-size: 13px; color: var(--muted); margin: 6px 0; }
      
      #ac-speed { display:flex; align-items:center; gap: 10px; margin: 12px 0; color: var(--muted); font-size: 13px; font-family: ui-monospace, "JetBrains Mono", monospace; }
      #ac-speed::before { content:"Interval"; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; font-family: inherit; color: var(--muted2); }
      #ac-interval {
        width: 84px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--border2);
        background: var(--surface); color: var(--text); outline: none; font-size: 14px;
        transition: border-color .18s, box-shadow .18s;
      }
      #ac-interval:focus { border-color: rgba(34,197,94,.70); box-shadow: 0 0 0 4px rgba(34,197,94,.16); }
      #ac-panel[data-theme="light"] #ac-interval { background: #ffffff; }

      #ac-controls { display: flex; justify-content: center; align-items: center; gap: 14px; margin-top: 18px; }
      #ac-controls button {
        flex: 1; padding: 12px 0; border: 0; border-radius: 999px; cursor: pointer;
        font-weight: 950; letter-spacing: .10em; text-transform: uppercase; font-size: 13px;
        display: flex; justify-content: center; align-items: center;
        transition: transform .12s, filter .18s, box-shadow .18s, opacity .18s;
      }
      #ac-start {
        color: #052e16; background: linear-gradient(135deg, rgba(34,197,94,1), rgba(96,165,250,.85));
        box-shadow: 0 8px 24px rgba(34,197,94,.25);
      }
      #ac-start:hover:not(:disabled) { transform: translateY(-2px); filter: saturate(1.1); box-shadow: 0 12px 28px rgba(34,197,94,.35); }
      #ac-start:active:not(:disabled) { transform: translateY(0) scale(.98); }
      #ac-stop {
        color: #fff; background: linear-gradient(135deg, rgba(239,68,68,1), rgba(245,158,11,.70));
        box-shadow: 0 8px 24px rgba(239,68,68,.25);
      }
      #ac-stop:hover:not(:disabled) { transform: translateY(-2px); filter: saturate(1.1); box-shadow: 0 12px 28px rgba(239,68,68,.35); }
      #ac-stop:active:not(:disabled) { transform: translateY(0) scale(.98); }
      #ac-controls button:disabled { opacity:.45; cursor:not-allowed; box-shadow:none; }

      #ac-hint { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--border); color: var(--muted); font-size: 11px; text-align:center; }
      #ac-panel[data-theme="light"] #ac-hint { color: rgba(11, 18, 32, .68); }
      #ac-hint kbd {
        display:inline-block; padding: 4px 8px; margin: 0 2px; border-radius: 8px; border: 1px solid var(--border2);
        background: var(--surface2); color: var(--accent); font-family: ui-monospace, monospace; font-weight: 900;
      }
      #ac-panel[data-theme="light"] #ac-hint kbd { background: #ffffff; color: #0f5132; }

      .ac-divider { height: 1px; margin: 16px 0 12px; background: linear-gradient(90deg, transparent, rgba(148,163,184,.45), transparent); }
      
      .ac-footer { display:flex; align-items:center; justify-content:space-between; }
      .ac-badge { font-size: 10px; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(34,197,94,.30); background: rgba(34,197,94,.10); color: var(--accent); font-weight: 950; }
      #ac-panel[data-theme="light"] .ac-badge { color: #16a34a; border-color: rgba(34, 197, 94, 0.6); }
      .ac-credits { font-size: 10px; color: var(--muted2); font-weight: 800; display: flex; align-items: center; gap: 4px; }
      .ac-brand { color: var(--text); }
      .ac-footer-link { display: inline-flex; align-items: center; gap: 3px; color: var(--accent2); text-decoration: none; transition: color 0.2s; }
      .ac-footer-link:hover { color: var(--accent); text-decoration: underline; }

      ::-webkit-scrollbar { width: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.3); border-radius: 10px; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.5); }
    `;
    shadowRoot.appendChild(style);
  }

  function createPanelShell() {
    createHostAndShadow();
    panel = document.createElement("div");
    panel.id = "ac-panel";

    panel.innerHTML = `
      <div class="content-wrapper">
        <div id="ac-header">
          <div id="ac-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle><path d="M12 8v4l3 3"></path>
            </svg>
            AUTO CLICKER
          </div>
          <div id="ac-header-right">
            <div id="ac-theme-toggle" role="switch" title="Toggle Theme"><div id="ac-theme-knob"></div></div>
            <div id="ac-close" title="Close Panel">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                 <line x1="18" y1="6" x2="6" y2="18"></line>
                 <line x1="6" y1="6" x2="18" y2="18"></line>
               </svg>
            </div>
          </div>
        </div>

        <div id="ac-body">
          <div id="ac-status-row">
            <div id="ac-status">Status: <span id="ac-status-text">Ready</span></div>
            <div id="ac-position-control" title="Drag the circle to set fixed click position.">
              <div id="ac-target"></div>
              <div id="ac-position-text">
                <span id="ac-position-label">Position</span>
                <span id="ac-position-mode">Mouse</span>
              </div>
            </div>
          </div>

          <div id="ac-single-view">
            <button id="ac-position-start" class="ac-pos-btn" disabled>POSITION START</button>
          </div>

          <div id="ac-multi-view" style="display:none;">
            <div class="ac-multi-btn-row">
              <button id="ac-add-target" type="button">Add point</button>
              <button id="ac-clear-targets" type="button">Clear</button>
            </div>
            <div id="ac-multi-list"></div>
          </div>

          <div id="ac-count">Clicks: <span id="ac-count-num">0</span></div>

          <div id="ac-speed">
            <input type="number" id="ac-interval" value="200" min="10">
            <span style="font-size: 13px; color: var(--muted2);">ms</span>
          </div>

          <div id="ac-controls">
            <button id="ac-start">START</button>
            <button id="ac-stop" disabled>STOP</button>
          </div>

          <div id="ac-hint">
            <div style="font-weight:600; margin-bottom:12px; letter-spacing: 0.05em; color: var(--text);">
              Press combination to control clicking
            </div>
            <div style="display:flex; justify-content:center; gap: 20px;">
              <div>Start: <kbd>Alt</kbd> + <kbd>P</kbd></div>
              <div>Stop: <kbd>Alt</kbd> + <kbd>E</kbd></div>
            </div>
          </div>

          <div class="ac-divider"></div>

          <div class="ac-footer">
            <div class="ac-badge">V2.0</div>
            <div class="ac-credits">
              BY <span class="ac-brand">BINOP</span> ·
              <a href="https://binopcz.github.io/autoclicker-web/" target="_blank" rel="noopener noreferrer" class="ac-footer-link">
                WEBSITE
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;

    shadowRoot.appendChild(panel);
    panelActive = true;

    statusText = shadowRoot.getElementById("ac-status-text");
    countDisplay = shadowRoot.getElementById("ac-count-num");
    intervalInput = shadowRoot.getElementById("ac-interval");
    startButton = shadowRoot.getElementById("ac-start");
    stopButton = shadowRoot.getElementById("ac-stop");
    themeToggle = shadowRoot.getElementById("ac-theme-toggle");
    targetBtn = shadowRoot.getElementById("ac-target");

    const header = shadowRoot.getElementById("ac-header");
    const closeButton = shadowRoot.getElementById("ac-close");
    const positionStartButton = shadowRoot.getElementById("ac-position-start");
    const addTargetButton = shadowRoot.getElementById("ac-add-target");
    const clearTargetsButton = shadowRoot.getElementById("ac-clear-targets");

    if (targetBtn) targetBtn.addEventListener("mousedown", startPicking);

    addTargetButton.addEventListener("click", () => {
      panelMode = "multi";
      switchToMode();
      startMultiPicking();
    });

    clearTargetsButton.addEventListener("click", () => {
      clearMultiTargets();
      if (!isRunning) {
        setStatus("Targets cleared", "#ef4444");
        setTimeout(() => setStatus("Ready", "#22c55e"), 700);
      }
    });

    loadTheme((theme) => applyTheme(theme));

    let dragStartX = 0, dragStartY = 0, panelStartX = 0, panelStartY = 0;

    function onDragMove(e) {
      e.preventDefault();
      host.style.right = "auto"; host.style.bottom = "auto";
      host.style.left = panelStartX + (e.clientX - dragStartX) + "px";
      host.style.top = panelStartY + (e.clientY - dragStartY) + "px";
    }

    function onDragEnd() {
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", onDragEnd);
      header.style.cursor = "grab";
    }

    header.addEventListener("mousedown", (e) => {
      if (e.target.id === "ac-close" || e.target.closest("#ac-theme-toggle") || e.target.closest("#ac-close")) return;
      dragStartX = e.clientX; dragStartY = e.clientY;
      const rect = host.getBoundingClientRect();
      panelStartX = rect.left; panelStartY = rect.top;
      header.style.cursor = "grabbing";
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
    });

    closeButton.addEventListener("click", () => {
      stopClicking();
      multiPicking = false;
      hideMultiOverlay();
      hideIndicatorIfNotMultiPicking();
      clearMultiMarkers();
      host.style.display = "none";
      panelActive = false;
    });

    themeToggle.addEventListener("click", () => {
      const current = panel.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
      saveTheme(next);
    });

    startButton.addEventListener("click", () => {
      if (panelMode === "single") clickMode = "mouse";
      startClicking();
    });

    stopButton.addEventListener("click", stopClicking);

    positionStartButton.addEventListener("click", () => {
      if (!positionLocked) return;
      if (isRunning && clickMode === "fixed") { stopClicking(); return; }
      clickMode = "fixed"; panelMode = "single";
      switchToMode();
      startClicking();
    });

    intervalInput.addEventListener("change", () => {
      intervalMs = parseInt(intervalInput.value, 10) || 200;
      ccSetInterval(intervalMs);
    });

    updatePositionLabel();
    updatePositionStartState();
    renderMultiTargets();
    setStatus("Ready", "#22c55e");
  }

  function switchToMode() {
    if (!shadowRoot) return;
    const singleView = shadowRoot.getElementById("ac-single-view");
    const multiView = shadowRoot.getElementById("ac-multi-view");
    const posControl = shadowRoot.getElementById("ac-position-control");
    const speedControl = shadowRoot.getElementById("ac-speed"); // ADD

    if (panelMode === "single") {
      if (singleView) singleView.style.display = "block";
      if (multiView) multiView.style.display = "none";
      if (posControl) posControl.style.display = "flex";
      if (speedControl) speedControl.style.display = "flex"; // ADD
      renderMultiMarkers();
      showSingleIndicator();
    } else {
      if (singleView) singleView.style.display = "none";
      if (multiView) multiView.style.display = "block";
      if (posControl) posControl.style.display = "none";
      if (speedControl) speedControl.style.display = "none"; // ADD
      clearMultiMarkers();
      renderMultiMarkers();
      hideIndicatorIfNotMultiPicking();
    }
  }

  function buildPanel(initialMode) {
    panelMode = initialMode === "multi" ? "multi" : "single";
    if (!host) createPanelShell();
    host.style.display = "block";
    panelActive = true;
    switchToMode();
    setStatus("Ready", "#22c55e");
    document.body.appendChild(host);
  }

  // KEYBOARD SHORTCUTS (Alt + P, Alt + E)
  document.addEventListener("keydown", (e) => {
    if (!panelActive || (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName))) return;
    const key = e.key.toLowerCase();
    if (e[modifierKey] && key === stopKey) {
      if (isRunning) { e.preventDefault(); stopClicking(); }
    } else if (e[modifierKey] && key === startKey) {
      if (!isRunning) {
        e.preventDefault();
        if (panelMode === "single") clickMode = "mouse";
        startClicking();
      }
    }
  });

  // MESSAGES
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && (message.type === "ac:show-panel" || message.action === "show_panel")) {
      buildPanel(message.mode || "single");
      sendResponse({ ok: true });
    }
    return true;
  });
})();
