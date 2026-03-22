(() => {
// ── State ─────────────────────────────────────────────────────────────────
let isRunning    = false;
let clickInterval = null;
let clickCount   = 0;
let intervalMs   = 200;
let stopKey      = 'e';
let startKey     = 'p';
let panel        = null;
let countDisplay = null;
let intervalInput = null;
let startButton  = null;
let stopButton   = null;
let statusText   = null;
let themeToggle  = null;
let panelActive  = false;
let currentMode  = 'single';

let mouseX = window.innerWidth  / 2;
let mouseY = window.innerHeight / 2;
document.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

let positionLocked    = false;
let fixedX = mouseX, fixedY = mouseY;
let targetBtn         = null;
let targetIndicator   = null;
let pickStartX = 0, pickStartY = 0, pickMoved = false;
let lastPickX  = 0, lastPickY  = 0;
let clickMode  = 'mouse';

let multiTargets   = [];
let multiIndex     = 0;
let multiTimeout   = null;
let isPickingMulti = false;

const isCookieClicker =
  location.hostname === 'orteil.dashnet.org' &&
  location.pathname.includes('cookieclicker');
let ccActive         = false;
let isFixedOnBigCookie = false;

const isGreen = () => panel?.dataset?.theme === 'green';

// ═════════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════════
function setStatus(msg, color) {
  if (!statusText) return;
  statusText.textContent = msg;
  if (color) statusText.style.color = color;
}

function ccSend(message, onOk) {
  try {
    chrome.runtime.sendMessage(message, resp => {
      const err = chrome.runtime.lastError;
      if (err || !resp?.ok) {
        setStatus('Cookie mode blocked – enable site access', '#f59e0b');
        return;
      }
      onOk?.();
    });
  } catch (e) {
    setStatus('Cookie mode blocked – enable site access', '#f59e0b');
  }
}

function ccStart(ms)       { if (!isCookieClicker) return; ccSend({ type: 'CCSTART',       intervalMs: ms }, () => { ccActive = true;  }); }
function ccStop()          { if (!isCookieClicker) return; ccSend({ type: 'CCSTOP'                        }, () => { ccActive = false; }); }
function ccSetInterval(ms) { if (!isCookieClicker || !ccActive) return; ccSend({ type: 'CCSETINTERVAL', intervalMs: ms }); }

// ── Single target indicator ───────────────────────────────────────────────
function ensureTargetIndicator() {
  if (targetIndicator) return;
  targetIndicator = document.createElement('div');
  targetIndicator.id = 'ac-target-indicator';
  targetIndicator.style.display = 'none';
  document.body.appendChild(targetIndicator);
}

function moveIndicator(x, y) {
  ensureTargetIndicator();
  targetIndicator.style.left = x + 'px';
  targetIndicator.style.top  = y + 'px';
}

// ── Multi-click indicators ────────────────────────────────────────────────
const MULTI_COLORS = ['#22c55e','#60a5fa','#f59e0b','#a855f7','#ef4444','#06b6d4'];

function createMultiIndicator(index) {
  const color = MULTI_COLORS[index % MULTI_COLORS.length];
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed; width:22px; height:22px; border-radius:50%;
    border:2.5px solid ${color}; background:${color}22;
    pointer-events:none; z-index:2147483646; transform:translate(-50%,-50%);
    display:flex; align-items:center; justify-content:center;
    font-size:10px; font-weight:900; color:${color}; box-shadow:0 0 0 4px ${color}22;
  `;
  el.textContent = index + 1;
  document.body.appendChild(el);
  return el;
}

function removeAllMultiIndicators() { multiTargets.forEach(t => t.indicator?.remove()); }

function rebuildMultiIndicators() {
  removeAllMultiIndicators();
  multiTargets = multiTargets.map((t, i) => {
    const ind = createMultiIndicator(i);
    ind.style.left = t.x + 'px';
    ind.style.top  = t.y + 'px';
    return { ...t, indicator: ind };
  });
}

// ═════════════════════════════════════════════════════════════════════════
// FLOATING ORBS
// ═════════════════════════════════════════════════════════════════════════
const ORB_CONFIGS_BLUE = [
  { color: 'rgba(37, 99,235,.60)',  size: 55, left: '8%',  delay: '0s',   duration: '7s'  },
  { color: 'rgba(99,102,241,.50)',  size: 45, left: '72%', delay: '2.2s', duration: '9s'  },
  { color: 'rgba(59,130,246,.55)',  size: 50, left: '38%', delay: '4.5s', duration: '8s'  },
  { color: 'rgba(147,197,253,.45)', size: 35, left: '85%', delay: '1.0s', duration: '11s' },
  { color: 'rgba(99,102,241,.42)',  size: 40, left: '22%', delay: '6.0s', duration: '10s' },
];

const ORB_CONFIGS_GREEN = [
  { color: 'rgba(21,128, 61,.60)',  size: 55, left: '8%',  delay: '0s',   duration: '7s'  },
  { color: 'rgba(5, 150,105,.50)',  size: 45, left: '72%', delay: '2.2s', duration: '9s'  },
  { color: 'rgba(34,197, 94,.55)',  size: 50, left: '38%', delay: '4.5s', duration: '8s'  },
  { color: 'rgba(74, 222,128,.45)', size: 35, left: '85%', delay: '1.0s', duration: '11s' },
  { color: 'rgba(16,185, 129,.42)', size: 40, left: '22%', delay: '6.0s', duration: '10s' },
];

function spawnOrbs(theme) {
  panel.querySelectorAll('.ac-orb').forEach(o => o.remove());
  const configs  = theme === 'green' ? ORB_CONFIGS_GREEN : ORB_CONFIGS_BLUE;
  const animName = theme === 'green' ? 'ac-float-green'  : 'ac-float';
  configs.forEach(cfg => {
    const orb = document.createElement('div');
    orb.className = 'ac-orb';
    orb.style.cssText = `
      width:${cfg.size}px; height:${cfg.size}px;
      background:radial-gradient(circle at 40% 40%, ${cfg.color}, transparent 70%);
      left:${cfg.left}; bottom:-${cfg.size}px;
      animation-duration:${cfg.duration}; animation-delay:${cfg.delay};
      animation-name:${animName};
    `;
    panel.appendChild(orb);
  });
}

// ═════════════════════════════════════════════════════════════════════════
// SINGLE MODE
// ═════════════════════════════════════════════════════════════════════════
function updatePositionLabel() {
  const label = document.getElementById('ac-position-mode');
  if (label) label.textContent = positionLocked ? 'Fixed' : 'Mouse';
}

function updatePositionStartState() {
  const btn = document.getElementById('ac-position-start');
  if (!btn) return;
  btn.disabled = !positionLocked;
  if (!positionLocked) {
    btn.classList.remove('active');
    btn.textContent = 'Position START';
    return;
  }
  const activeFixed = isRunning && clickMode === 'fixed';
  btn.classList.toggle('active', activeFixed);
  btn.textContent = activeFixed ? 'Position STOP' : 'Position START';
}

function updateResetBtn() {
  const btn = document.getElementById('ac-position-reset');
  if (btn) btn.disabled = !positionLocked;
}

function checkBigCookie(x, y) {
  if (!isCookieClicker) return false;
  const prevI = targetIndicator?.style.display;
  const prevP = panel?.style.display;
  if (targetIndicator) targetIndicator.style.display = 'none';
  if (panel) panel.style.display = 'none';
  const els = document.elementsFromPoint(x, y);
  let found = false;
  for (const el of els) { if (el?.id === 'bigCookie') { found = true; break; } }
  if (targetIndicator) targetIndicator.style.display = prevI;
  if (panel) panel.style.display = prevP;
  return found;
}

function lockPosition(x, y) {
  fixedX = x; fixedY = y; positionLocked = true;
  ensureTargetIndicator();
  targetIndicator.style.display = 'block';
  moveIndicator(x, y);
  if (targetBtn) targetBtn.classList.add('active');
  isFixedOnBigCookie = checkBigCookie(x, y);
  updatePositionLabel();
  updatePositionStartState();
  updateResetBtn();
}

function unlockPosition() {
  positionLocked = false; isFixedOnBigCookie = false;
  ensureTargetIndicator();
  targetIndicator.style.display = 'none';
  if (targetBtn) targetBtn.classList.remove('active');
  updatePositionLabel();
  if (isRunning && clickMode === 'fixed') stopClicking();
  if (ccActive) ccStop();
  clickMode = 'mouse';
  updatePositionStartState();
  updateResetBtn();
}

function onPickMove(e) {
  lastPickX = e.clientX; lastPickY = e.clientY;
  if (Math.abs(lastPickX - pickStartX) > 3 || Math.abs(lastPickY - pickStartY) > 3) pickMoved = true;
  ensureTargetIndicator();
  targetIndicator.style.display = 'block';
  moveIndicator(lastPickX, lastPickY);
}

function onPickEnd() {
  document.removeEventListener('mousemove', onPickMove, true);
  document.removeEventListener('mouseup',   onPickEnd,  true);
  if (pickMoved) { lockPosition(lastPickX, lastPickY); return; }
  if (positionLocked) unlockPosition(); else lockPosition(mouseX, mouseY);
}

function startPicking(e) {
  e.preventDefault(); e.stopPropagation();
  pickStartX = e.clientX; pickStartY = e.clientY;
  lastPickX = pickStartX; lastPickY = pickStartY;
  pickMoved = false;
  ensureTargetIndicator();
  targetIndicator.style.display = 'block';
  moveIndicator(lastPickX, lastPickY);
  document.addEventListener('mousemove', onPickMove, true);
  document.addEventListener('mouseup',   onPickEnd,  true);
}

// ═════════════════════════════════════════════════════════════════════════
// MULTI MODE
// ═════════════════════════════════════════════════════════════════════════
let pickOverlay = null;

function createPickOverlay(callback) {
  if (pickOverlay) pickOverlay.remove();
  pickOverlay = document.createElement('div');
  pickOverlay.style.cssText = `position:fixed;inset:0;z-index:2147483645;cursor:crosshair;background:rgba(34,197,94,0.04);`;

  const crosshair = document.createElement('div');
  crosshair.style.cssText = `
    position:fixed; width:20px; height:20px; border-radius:50%;
    border:2px solid #22c55e; background:rgba(34,197,94,.15);
    pointer-events:none; transform:translate(-50%,-50%); z-index:2147483647;
  `;
  document.body.appendChild(crosshair);

  pickOverlay.addEventListener('mousemove', e => {
    crosshair.style.left = e.clientX + 'px';
    crosshair.style.top  = e.clientY + 'px';
  });

  pickOverlay.addEventListener('click', e => {
    e.preventDefault(); e.stopImmediatePropagation();
    const x = e.clientX, y = e.clientY;
    crosshair.remove(); pickOverlay.remove(); pickOverlay = null; isPickingMulti = false;
    callback(x, y);
  });

  const onKey = e => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    crosshair.remove(); pickOverlay.remove(); pickOverlay = null; isPickingMulti = false;
    document.removeEventListener('keydown', onKey, true);
    const addBtn = document.getElementById('ac-multi-add');
    if (addBtn) { addBtn.textContent = '+ Add Target'; addBtn.disabled = false; }
  };
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(pickOverlay);
}

function startMultiPick(callback) {
  if (isPickingMulti) return;
  isPickingMulti = true;
  createPickOverlay(callback);
}

function addMultiTarget(x, y, interval) {
  const idx = multiTargets.length;
  const indicator = createMultiIndicator(idx);
  indicator.style.left = x + 'px';
  indicator.style.top  = y + 'px';
  multiTargets.push({ x, y, interval: interval || intervalMs, indicator });
  renderMultiList();
}

function removeMultiTarget(index) {
  multiTargets[index]?.indicator?.remove();
  multiTargets.splice(index, 1);
  rebuildMultiIndicators();
  renderMultiList();
}

function clearAllTargets() {
  removeAllMultiIndicators();
  multiTargets = [];
  renderMultiList();
}

function renderMultiList() {
  const list = document.getElementById('ac-multi-list');
  if (!list) return;
  list.innerHTML = '';

  const green       = isGreen();
  const accentColor = green ? '#22c55e'                : '#60a5fa';
  const textColor   = green ? 'rgba(220,252,231,.90)'  : 'rgba(226,238,255,.90)';
  const mutedColor  = green ? 'rgba(220,252,231,.55)'  : 'rgba(226,238,255,.55)';
  const inputBg     = green ? 'rgba(2,26,12,.80)'      : 'rgba(5,14,36,.80)';
  const inputBorder = green ? 'rgba(34,197,94,.28)'    : 'rgba(96,165,250,.28)';

  if (multiTargets.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = `font-size:10px;text-align:center;padding:8px 4px;line-height:1.6;color:${mutedColor};`;
    empty.innerHTML = `No targets yet. Click <strong style="color:${accentColor}">+ Add Target</strong>,<br>then click anywhere on the page.`;
    list.appendChild(empty);
  } else {
    multiTargets.forEach((t, i) => {
      const color = MULTI_COLORS[i % MULTI_COLORS.length];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:5px;margin-bottom:4px;';
      row.innerHTML = `
        <span style="width:16px;height:16px;border-radius:50%;border:2px solid ${color};
          background:${color}22;display:flex;align-items:center;justify-content:center;
          font-size:8px;font-weight:900;color:${color};flex-shrink:0">${i + 1}</span>
        <span style="font-size:10px;color:${textColor};flex:1;font-family:monospace;
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${Math.round(t.x)}, ${Math.round(t.y)}</span>
        <input type="number" min="50" value="${t.interval}"
          style="width:56px;padding:2px 4px;border-radius:6px;border:1px solid ${inputBorder};
            background:${inputBg};color:${textColor};font-size:10px;outline:none;font-weight:600"
          data-idx="${i}">
        <span style="font-size:9px;color:${mutedColor};flex-shrink:0">ms</span>
        <button data-del="${i}" style="width:18px;height:18px;border-radius:50%;
          border:1px solid rgba(239,68,68,.40);background:rgba(239,68,68,.12);
          color:#ef4444;cursor:pointer;font-size:11px;font-weight:900;padding:0;
          display:flex;align-items:center;justify-content:center;flex-shrink:0"
          title="Remove">×</button>
      `;
      row.querySelector('input').addEventListener('change', e => {
        multiTargets[parseInt(e.target.dataset.idx)].interval = Math.max(50, parseInt(e.target.value) || 200);
      });
      row.querySelector('[data-del]').addEventListener('click', e => {
        removeMultiTarget(parseInt(e.target.dataset.del));
      });
      list.appendChild(row);
    });
  }

  const removeAllBtn = document.getElementById('ac-remove-all');
  if (removeAllBtn) removeAllBtn.style.display = multiTargets.length > 0 ? 'flex' : 'none';

  const sb = document.getElementById('ac-start');
  if (sb && currentMode === 'multi') sb.disabled = multiTargets.length === 0;
}

// ── DRAG ─────────────────────────────────────────────────────────────────
let dragStartX = 0, dragStartY = 0, panelStartX = 0, panelStartY = 0;

function onDragMove(e) {
  e.preventDefault();
  panel.style.left = (panelStartX + e.clientX - dragStartX) + 'px';
  panel.style.top  = (panelStartY + e.clientY - dragStartY) + 'px';
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup',   onDragEnd);
  const header = document.getElementById('ac-header');
  if (header) header.style.cursor = 'grab';
}

// ── THEME ─────────────────────────────────────────────────────────────────
function loadTheme(callback) {
  if (!chrome.storage?.sync) { callback('blue'); return; }
  chrome.storage.sync.get({ acTheme: 'blue' }, data => callback(data.acTheme));
}

function saveTheme(theme) { chrome.storage?.sync?.set({ acTheme: theme }); }

function applyTheme(theme) {
  if (!panel) return;
  panel.dataset.theme = theme;
  spawnOrbs(theme);
  renderMultiList();
}

// ═════════════════════════════════════════════════════════════════════════
// CLICK HELPERS
// ═════════════════════════════════════════════════════════════════════════
function getClickableAtPoint(x, y) {
  const els = document.elementsFromPoint(x, y);
  if (!els?.length) return null;
  for (const el of els) {
    if (!el || el.id === 'ac-target-indicator') continue;
    if (el.id === 'ac-panel' || el.closest?.('#ac-panel')) continue;
    const tag = el.tagName;
    if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT') return el;
    if (typeof el.onclick === 'function') return el;
  }
  for (const el of els) {
    if (!el || el.id === 'ac-target-indicator') continue;
    if (el.id === 'ac-panel' || el.closest?.('#ac-panel')) continue;
    return el;
  }
  return null;
}

function dispatchClick(el, x, y) {
  if (!el) return;
  const props = {
    bubbles: true, cancelable: true, view: window,
    clientX: x, clientY: y,
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1
  };
  try {
    el.dispatchEvent(new PointerEvent('pointerdown', props));
    el.dispatchEvent(new MouseEvent ('mousedown',   props));
    el.dispatchEvent(new PointerEvent('pointerup',   props));
    el.dispatchEvent(new MouseEvent ('mouseup',     props));
    el.dispatchEvent(new MouseEvent ('click',       props));
  } catch (e) { try { el.click(); } catch (e2) {} }
}

// ═════════════════════════════════════════════════════════════════════════
// START / STOP
// ═════════════════════════════════════════════════════════════════════════
function startClicking() {
  if (isRunning) return;
  clickCount = 0;
  if (countDisplay) countDisplay.textContent = '0';
  isRunning = true;
  if (startButton) startButton.disabled = true;
  if (stopButton)  stopButton.disabled  = false;
  updatePositionStartState();

  if (currentMode === 'multi') {
    if (multiTargets.length === 0) { stopClicking(); return; }
    setStatus('Multi Running...', 'var(--accent)');
    multiIndex = 0;
    function runNext() {
      if (!isRunning) return;
      const t = multiTargets[multiIndex];
      if (!t) { multiIndex = 0; runNext(); return; }
      const el = getClickableAtPoint(t.x, t.y);
      if (el) {
        dispatchClick(el, t.x, t.y);
        clickCount++;
        if (countDisplay) countDisplay.textContent = clickCount;
      }
      multiIndex = (multiIndex + 1) % multiTargets.length;
      multiTimeout = setTimeout(runNext, t.interval);
    }
    runNext();
  } else {
    setStatus(clickMode === 'fixed' ? 'Running Position' : 'Running...', '#22c55e');
    const useCookieMain = isCookieClicker && clickMode === 'fixed' && positionLocked && isFixedOnBigCookie;
    if (useCookieMain) {
      ccStart(intervalMs);
      
      clickInterval = setInterval(() => {
        clickCount++;
        if (countDisplay) countDisplay.textContent = clickCount;
      }, intervalMs);
    } else {
      if (ccActive) ccStop();
      clickInterval = setInterval(() => {
        const x = clickMode === 'fixed' ? fixedX : mouseX;
        const y = clickMode === 'fixed' ? fixedY : mouseY;
        if (clickMode === 'fixed' && !positionLocked) return;
        const el = getClickableAtPoint(x, y);
        if (!el) return;
        dispatchClick(el, x, y);
        clickCount++;
        if (countDisplay) countDisplay.textContent = clickCount;
      }, intervalMs);
    }
  }
}

function stopClicking() {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(clickInterval);
  clearTimeout(multiTimeout);
  clickInterval = null;
  multiTimeout  = null;
  if (startButton) startButton.disabled = false;
  if (stopButton)  stopButton.disabled  = true;
  setStatus('Stopped', '#ef4444');
  if (ccActive) ccStop();
  updatePositionStartState();
}

// ═════════════════════════════════════════════════════════════════════════
// CREATE PANEL
// ═════════════════════════════════════════════════════════════════════════
function createPanel(mode) {
  currentMode = mode || 'single';

  if (panel) {
    panel.style.display = 'block';
    panelActive = true;
    switchPanelMode(currentMode);
    updatePositionLabel();
    updatePositionStartState();
    updateResetBtn();
    return;
  }

  panel = document.createElement('div');
  panel.id = 'ac-panel';
  panel.innerHTML = `
    <div id="ac-header" style="cursor:grab;user-select:none">
      <div id="ac-title">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4l3 3"/>
        </svg>
        <span>AUTO CLICKER</span>
      </div>
      <div id="ac-header-right">
        <div id="ac-theme-toggle" role="switch" title="Toggle theme: Blue / Green">
          <div id="ac-theme-knob"></div>
        </div>
        <div id="ac-close" title="Close">&#x2715;</div>
      </div>
    </div>

    <div id="ac-body">

      <div id="ac-status-row">
        <div id="ac-status">Status <span id="ac-status-text">Ready</span></div>
      </div>

      <div id="ac-mode-tabs">
        <button class="ac-tab-btn ${currentMode==='single'?'active':''}" data-tab="single" title="Single Click">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="6" y="3" width="12" height="18" rx="6"/>
            <path d="M12 3v7"/>
            <circle cx="9" cy="10" r="1.8" fill="currentColor" stroke="none"/>
          </svg>
          <span>Single</span>
        </button>
        <button class="ac-tab-btn ${currentMode==='multi'?'active':''}" data-tab="multi" title="Multi Click">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>
            <line x1="12" y1="3"  x2="12" y2="1"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="3"  y1="12" x2="1"  y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
          </svg>
          <span>Multi</span>
        </button>
      </div>

      <!-- SINGLE PANEL -->
      <div id="ac-single-panel" style="display:${currentMode==='single'?'block':'none'}">
        <div id="ac-position-row">
          <div id="ac-position-control" title="Drag the circle to set a fixed click position">
            <div id="ac-target"></div>
            <div id="ac-position-text">
              <span id="ac-position-label">Position</span>
              <span id="ac-position-mode">Mouse</span>
            </div>
          </div>
          <button id="ac-position-reset" title="Reset to Mouse mode" disabled>↺</button>
        </div>
        <button id="ac-position-start" class="ac-pos-btn" disabled>Position START</button>
        <div style="font-size:10px;margin:4px 0 2px">
          <span class="ac-clicks-label">Clicks </span>
          <span id="ac-count-num" style="color:var(--accent);font-weight:800">0</span>
        </div>
        <div id="ac-speed">
          <span class="ac-speed-label">Interval</span>
          <input type="number" id="ac-interval" value="${intervalMs}" min="10">
          <span id="ac-speed-ms">ms</span>
        </div>
      </div>

      <!-- MULTI PANEL -->
      <div id="ac-multi-panel" style="display:${currentMode==='multi'?'block':'none'}">
        <div style="font-size:10px;margin:0 0 5px">
          <span class="ac-clicks-label">Clicks </span>
          <span id="ac-count-num-multi" style="color:var(--accent);font-weight:800">0</span>
        </div>
        <div id="ac-multi-list"></div>
        <div style="display:flex;gap:5px;margin:4px 0">
          <button id="ac-multi-add" class="ac-pos-btn" style="flex:1;margin:0">+ Add Target</button>
          <button id="ac-remove-all" title="Remove all targets">&#x2715; All</button>
        </div>
        <div style="display:flex;align-items:center;gap:7px;margin:4px 0;font-size:10px">
          <span id="ac-default-ms-label">Default ms</span>
          <input type="number" id="ac-multi-default-interval" value="${intervalMs}" min="50">
          <span class="ac-default-ms-suffix">ms</span>
        </div>
      </div>

      <div id="ac-controls">
        <button id="ac-start">START</button>
        <button id="ac-stop" disabled>STOP</button>
      </div>

      <div id="ac-hint">
        <div id="ac-hint-title">Keyboard shortcuts</div>
        <div style="display:flex;justify-content:center;gap:16px">
          <div style="display:flex;align-items:center;gap:5px">
            <span class="ac-hint-label">Start</span>
            <span style="display:flex;gap:3px"><kbd>Ctrl</kbd><kbd>P</kbd></span>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <span class="ac-hint-label">Stop</span>
            <span style="display:flex;gap:3px"><kbd>Ctrl</kbd><kbd>E</kbd></span>
          </div>
        </div>
      </div>

    </div>

    <div class="ac-divider"></div>

    <div class="ac-footer">
      <div><span class="ac-badge">v1.2.0</span></div>
      <div class="ac-credits">
        By <span class="ac-brand">BINOP</span>
        <a href="https://binopcz.github.io/autoclicker-web"
           target="_blank" rel="noopener noreferrer" class="ac-footer-link">
          Website
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  panelActive = true;

  // ── Element references ──────────────────────────────────────────────────
  statusText       = document.getElementById('ac-status-text');
  countDisplay     = currentMode === 'multi'
    ? document.getElementById('ac-count-num-multi')
    : document.getElementById('ac-count-num');
  intervalInput    = document.getElementById('ac-interval');
  startButton      = document.getElementById('ac-start');
  stopButton       = document.getElementById('ac-stop');
  themeToggle      = document.getElementById('ac-theme-toggle');
  targetBtn        = document.getElementById('ac-target');

  const posStartBtn    = document.getElementById('ac-position-start');
  const posResetBtn    = document.getElementById('ac-position-reset');
  const header         = document.getElementById('ac-header');
  const addBtn         = document.getElementById('ac-multi-add');
  const removeAllBtn   = document.getElementById('ac-remove-all');
  const multiDefaultIn = document.getElementById('ac-multi-default-interval');
  const multiList      = document.getElementById('ac-multi-list');

  // ── Scroll isolation ────────────────────────────────────────────────────
  panel.addEventListener('wheel', e => e.stopPropagation(), { passive: false });
  if (multiList) {
    multiList.style.cssText = `
      max-height:130px; overflow-y:auto; overflow-x:hidden;
      margin:5px 0; scrollbar-width:thin; padding-right:2px;
    `;
    multiList.addEventListener('wheel', e => {
      const atTop    = multiList.scrollTop === 0 && e.deltaY < 0;
      const atBottom = multiList.scrollTop + multiList.clientHeight >= multiList.scrollHeight && e.deltaY > 0;
      if (!atTop && !atBottom) e.stopPropagation();
    }, { passive: true });
  }

  // ── Injected styles (tab buttons + scrollbar) ───────────────────────────
  const tabStyle = document.createElement('style');
  tabStyle.textContent = `
    #ac-mode-tabs { display:flex; gap:5px; margin:7px 0 8px; }
    .ac-tab-btn {
      flex:1; padding:4px 6px; border-radius:7px;
      border:1px solid var(--border2); background:transparent;
      color:var(--muted); font-size:10px; font-weight:700;
      cursor:pointer; transition:all .20s; letter-spacing:.03em;
      display:flex; align-items:center; justify-content:center; gap:4px;
    }
    .ac-tab-btn.active {
      color:var(--accent); border-color:var(--accent);
      background:color-mix(in srgb, var(--accent) 12%, transparent);
    }
    .ac-tab-btn.active svg { stroke:var(--accent); }
    .ac-tab-btn:hover:not(.active) {
      border-color:var(--border2); background:rgba(255,255,255,.05);
    }
    #ac-multi-list::-webkit-scrollbar       { width:4px; }
    #ac-multi-list::-webkit-scrollbar-track { background:transparent; }
    #ac-multi-list::-webkit-scrollbar-thumb {
      background:color-mix(in srgb, var(--accent) 35%, transparent);
      border-radius:99px;
    }
  `;
  panel.appendChild(tabStyle);

  // ── Event listeners ─────────────────────────────────────────────────────
  panel.querySelectorAll('.ac-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isRunning) stopClicking();
      switchPanelMode(btn.dataset.tab);
    });
  });

  if (targetBtn) targetBtn.addEventListener('mousedown', startPicking);

  if (posStartBtn) posStartBtn.addEventListener('click', () => {
    if (!positionLocked) return;
    if (isRunning && clickMode === 'fixed') { stopClicking(); return; }
    clickMode = 'fixed';
    startClicking();
  });

  if (posResetBtn) posResetBtn.addEventListener('click', () => {
    if (isRunning) stopClicking();
    unlockPosition();
  });

  if (intervalInput) intervalInput.addEventListener('change', () => {
    intervalMs = Math.max(10, parseInt(intervalInput.value) || 200);
    ccSetInterval(intervalMs);
  });

  if (multiDefaultIn) multiDefaultIn.addEventListener('change', () => {
    intervalMs = Math.max(50, parseInt(multiDefaultIn.value) || 200);
  });

  if (addBtn) addBtn.addEventListener('click', () => {
    if (isRunning) return;
    addBtn.textContent = 'Click on target... ESC to cancel';
    addBtn.disabled = true;
    startMultiPick((x, y) => {
      addMultiTarget(x, y, intervalMs);
      addBtn.textContent = '+ Add Target';
      addBtn.disabled = false;
    });
  });

  if (removeAllBtn) removeAllBtn.addEventListener('click', () => {
    if (isRunning) stopClicking();
    clearAllTargets();
  });

  startButton.addEventListener('click', () => {
    if (currentMode === 'single') clickMode = 'mouse';
    startClicking();
  });

  stopButton.addEventListener('click', stopClicking);

  document.getElementById('ac-close').addEventListener('click', () => {
    stopClicking();
    unlockPosition();
    removeAllMultiIndicators();
    if (pickOverlay) { pickOverlay.remove(); pickOverlay = null; }
    isPickingMulti = false;
    panel.style.display = 'none';
    panelActive = false;
  });

  themeToggle.addEventListener('click', () => {
    const next = panel.dataset.theme === 'blue' ? 'green' : 'blue';
    applyTheme(next);
    saveTheme(next);
  });

  // Sync theme changes from popup in real time
  if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.acTheme) applyTheme(changes.acTheme.newValue);
    });
  }

  header.addEventListener('mousedown', e => {
    if (['ac-close','ac-target','ac-position-reset'].includes(e.target.id)) return;
    if (e.target.closest('#ac-theme-toggle')) return;
    dragStartX = e.clientX; dragStartY = e.clientY;
    const rect = panel.getBoundingClientRect();
    panelStartX = rect.left; panelStartY = rect.top;
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left   = panelStartX + 'px';
    panel.style.top    = panelStartY + 'px';
    panel.style.margin = '0';
    header.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup',   onDragEnd);
  });

  // ── Load theme & init ───────────────────────────────────────────────────
  loadTheme(t => {
    applyTheme(t);
    updatePositionLabel();
    updatePositionStartState();
    updateResetBtn();
    renderMultiList();
  });
}

// ═════════════════════════════════════════════════════════════════════════
// SWITCH TAB
// ═════════════════════════════════════════════════════════════════════════
function switchPanelMode(mode) {
  currentMode = mode;
  const singlePanel = document.getElementById('ac-single-panel');
  const multiPanel  = document.getElementById('ac-multi-panel');
  if (singlePanel) singlePanel.style.display = mode === 'single' ? 'block' : 'none';
  if (multiPanel)  multiPanel.style.display  = mode === 'multi'  ? 'block' : 'none';
  panel.querySelectorAll('.ac-tab-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.tab === mode)
  );
  countDisplay = mode === 'multi'
    ? document.getElementById('ac-count-num-multi')
    : document.getElementById('ac-count-num');
  chrome.storage?.sync?.set({ acMode: mode });
  renderMultiList();
}

// ═════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (!panelActive) return;
  if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
  const key = e.key.toLowerCase();
  if (e.ctrlKey && key === stopKey  &&  isRunning) { e.preventDefault(); stopClicking();  }
  if (e.ctrlKey && key === startKey && !isRunning) { e.preventDefault(); startClicking(); }
});

// ═════════════════════════════════════════════════════════════════════════
// MESSAGE LISTENER
// ═════════════════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener(msg => {
  if (msg?.action === 'showpanel') createPanel(msg.mode || 'single');
});

})();
