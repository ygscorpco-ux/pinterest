(function registerPpdUiModule() {
  const runtime = globalThis.__PPD_CONTENT_RUNTIME__;
  if (!runtime || runtime.initialized || runtime.modules.ui) {
    return;
  }

  runtime.modules.ui = true;

  const {
    state,
    ui,
    INJECTED_FLAG,
    PAGE_STYLE_ID,
    SHADOW_HOST_ID,
    ACTION_ATTR,
    MODE_ATTR,
    TOGGLE_ATTR,
    CLASS_CARD,
    CLASS_RELATIVE,
    CLASS_ACTIVE,
    CLASS_SELECTED,
    CLASS_MAIN
  } = runtime;

  runtime.init = init;
  runtime.injectPageStyle = injectPageStyle;
  runtime.buildUi = buildUi;
  runtime.bindUiEvents = bindUiEvents;
  runtime.bindRuntimeEvents = bindRuntimeEvents;
  runtime.bindWindowEvents = bindWindowEvents;
  runtime.renderAll = renderAll;
  runtime.renderFrameState = renderFrameState;
  runtime.renderStatus = renderStatus;
  runtime.renderSummary = renderSummary;
  runtime.renderModeButtons = renderModeButtons;
  runtime.renderQueue = renderQueue;
  runtime.renderSelectedList = renderSelectedList;
  runtime.clearSelectedListNodes = clearSelectedListNodes;

  runtime
    .init()
    .catch((error) => {
      runtime.initializationPromise = null;
      runtime.initializing = false;
      runtime.initialized = false;
      delete document.documentElement.dataset[INJECTED_FLAG];
      console.error('[PPD] Failed to initialize content script.', error);
    });

  async function init() {
    if (runtime.initialized) {
      return;
    }

    if (runtime.initializationPromise) {
      return runtime.initializationPromise;
    }

    runtime.initializing = true;
    runtime.initializationPromise = (async () => {
      state.settings = await runtime.getSettings();
      injectPageStyle();
      buildUi();
      bindUiEvents();
      bindRuntimeEvents();
      bindWindowEvents();
      runtime.markInitialized();
      renderAll();
    })();

    try {
      await runtime.initializationPromise;
    } finally {
      runtime.initializing = false;
    }
  }

  function injectPageStyle() {
    let style = document.getElementById(PAGE_STYLE_ID);
    if (style) {
      return;
    }

    style = document.createElement('style');
    style.id = PAGE_STYLE_ID;
    style.textContent = `
      .${CLASS_CARD} {
        box-sizing: border-box !important;
        transition: box-shadow 0.16s ease, background-color 0.16s ease, outline-color 0.16s ease !important;
      }

      .${CLASS_RELATIVE} {
        position: relative !important;
      }

      .${CLASS_ACTIVE} {
        box-shadow: inset 0 0 0 1px rgba(27, 71, 151, 0.16) !important;
        border-radius: 18px !important;
      }

      .${CLASS_SELECTED} {
        box-shadow:
          inset 0 0 0 2px rgba(27, 71, 151, 0.92),
          0 12px 28px rgba(27, 71, 151, 0.12) !important;
        background: linear-gradient(180deg, rgba(27, 71, 151, 0.08), rgba(27, 71, 151, 0.015)) !important;
      }

      .${CLASS_MAIN} {
        box-shadow:
          inset 0 0 0 2px rgba(27, 71, 151, 0.62),
          0 8px 22px rgba(27, 71, 151, 0.10) !important;
      }

      .${CLASS_MAIN}.${CLASS_SELECTED} {
        box-shadow:
          inset 0 0 0 2px rgba(27, 71, 151, 0.98),
          0 14px 32px rgba(27, 71, 151, 0.16) !important;
        background: linear-gradient(180deg, rgba(27, 71, 151, 0.12), rgba(27, 71, 151, 0.03)) !important;
      }

      .ppd-badge {
        position: absolute !important;
        z-index: 2147483000 !important;
        width: 80px !important;
        min-width: 80px !important;
        height: 34px !important;
        margin: 0 !important;
        border: none !important;
        border-radius: 999px !important;
        padding: 0 12px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 6px !important;
        appearance: none !important;
        -webkit-appearance: none !important;
        background: rgba(15, 23, 42, 0.92) !important;
        color: #ffffff !important;
        font: 700 12px/1 "Segoe UI", system-ui, sans-serif !important;
        letter-spacing: 0.01em !important;
        cursor: pointer !important;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22) !important;
        user-select: none !important;
        pointer-events: auto !important;
        outline: none !important;
        transform: none !important;
        transition: background-color 0.14s ease, color 0.14s ease, box-shadow 0.14s ease, opacity 0.14s ease !important;
      }

      .ppd-hit-area {
        position: absolute !important;
        inset: 0 !important;
        z-index: 2147482900 !important;
        display: block !important;
        border: none !important;
        border-radius: inherit !important;
        background: transparent !important;
        cursor: pointer !important;
        pointer-events: auto !important;
      }

      .ppd-badge[data-role="main"] {
        background: rgba(27, 71, 151, 0.16) !important;
        color: #1b4797 !important;
        box-shadow: 0 8px 18px rgba(27, 71, 151, 0.14) !important;
      }

      .ppd-badge[data-selected="true"] {
        background: linear-gradient(135deg, #1b4797, #2f6ad8) !important;
        color: #ffffff !important;
      }

      .ppd-badge[data-role="main"][data-selected="true"] {
        background: linear-gradient(135deg, #163d83, #1b4797) !important;
        color: #ffffff !important;
      }

      .ppd-badge[data-placement="top-left"] { top: 10px !important; left: 10px !important; }
      .ppd-badge[data-placement="top-right"] { top: 10px !important; right: 10px !important; }
      .ppd-badge[data-placement="bottom-left"] { bottom: 10px !important; left: 10px !important; }
      .ppd-badge[data-placement="bottom-right"] { bottom: 10px !important; right: 10px !important; }

      .ppd-badge__check {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 14px !important;
        height: 14px !important;
        font-size: 12px !important;
        line-height: 1 !important;
        opacity: 0.92 !important;
        flex: 0 0 auto !important;
      }

      .ppd-badge__label {
        display: inline-flex !important;
        align-items: center !important;
        line-height: 1 !important;
        flex: 0 0 auto !important;
      }
    `;
    document.head.appendChild(style);
  }

  function buildUi() {
    const existing = document.getElementById(SHADOW_HOST_ID);
    if (existing) {
      existing.remove();
    }

    const host = document.createElement('div');
    host.id = SHADOW_HOST_ID;
    host.style.all = 'initial';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = '2147483647';
    document.documentElement.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .launcher {
          pointer-events: auto;
          position: fixed;
          right: 20px;
          bottom: 20px;
          z-index: 50;
          border: 1px solid rgba(27, 71, 151, 0.14);
          border-radius: 999px;
          background: linear-gradient(180deg, #ffffff, #f5f9ff);
          color: #16325c;
          font: 700 13px/1.2 "Segoe UI", system-ui, sans-serif;
          padding: 12px 16px;
          box-shadow: 0 18px 44px rgba(15, 23, 42, 0.12);
          cursor: pointer;
        }
        .launcher.is-hidden { display: none; }
        .mini-bar {
          pointer-events: auto;
          position: fixed;
          top: 18px;
          right: 20px;
          z-index: 48;
          display: none;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 8px 10px;
          max-width: min(calc(100vw - 40px), 560px);
          padding: 10px 12px;
          border-radius: 999px;
          border: 1px solid rgba(27, 71, 151, 0.10);
          background: rgba(255, 255, 255, 0.94);
          color: #16325c;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
          backdrop-filter: blur(18px);
        }
        .mini-bar.is-visible { display: inline-flex; }
        .mini-pill {
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(27, 71, 151, 0.08);
          color: #1b4797;
          font: 800 12px/1 "Segoe UI", system-ui, sans-serif;
          white-space: nowrap;
        }
        .mini-actions { display: inline-flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .mini-button {
          border: 1px solid rgba(27, 71, 151, 0.10);
          border-radius: 999px;
          padding: 8px 12px;
          font: 700 12px/1 "Segoe UI", system-ui, sans-serif;
          cursor: pointer;
          color: #33588f;
          background: rgba(244, 248, 255, 0.98);
          white-space: nowrap;
        }
        .mini-button.primary {
          border-color: transparent;
          background: linear-gradient(135deg, #1b4797, #2f6ad8);
          color: #ffffff;
        }
        .mini-button.danger {
          border-color: rgba(27, 71, 151, 0.14);
          background: rgba(255, 255, 255, 0.98);
          color: #16325c;
        }
        .panel {
          pointer-events: auto;
          position: fixed;
          right: 20px;
          top: 70px;
          z-index: 49;
          width: 348px;
          max-height: min(calc(100vh - 112px), 720px);
          display: none;
          grid-template-rows: auto auto minmax(0, 1fr);
          border: 1px solid rgba(27, 71, 151, 0.10);
          border-radius: 28px;
          overflow: hidden;
          background:
            linear-gradient(180deg, rgba(247, 250, 255, 0.98), rgba(255, 255, 255, 0.98)),
            linear-gradient(180deg, rgba(27, 71, 151, 0.06), transparent 28%);
          color: #10213d;
          box-shadow: 0 26px 70px rgba(15, 23, 42, 0.16);
          backdrop-filter: blur(22px);
          font: 500 13px/1.45 "Segoe UI", system-ui, sans-serif;
        }
        .panel.is-open { display: grid; }
        .panel-header {
          display: grid;
          gap: 8px;
          padding: 18px 18px 14px;
          border-bottom: 1px solid rgba(27, 71, 151, 0.08);
        }
        .panel-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .panel-title { margin: 0; font-size: 16px; font-weight: 800; color: #10213d; }
        .close-button {
          border: 1px solid rgba(27, 71, 151, 0.10);
          border-radius: 999px;
          width: 32px;
          height: 32px;
          color: #56719d;
          background: rgba(245, 249, 255, 0.96);
          cursor: pointer;
        }
        .status-box {
          padding: 12px 14px;
          border-radius: 18px;
          background: rgba(27, 71, 151, 0.07);
          color: #29456f;
        }
        .status-box.error { background: rgba(198, 40, 40, 0.10); color: #9e2d2d; }
        .summary-grid {
          padding: 14px 18px 0;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }
        .summary-card {
          padding: 12px 13px;
          border-radius: 18px;
          border: 1px solid rgba(27, 71, 151, 0.08);
          background: rgba(255, 255, 255, 0.92);
        }
        .summary-label { font-size: 11px; color: #6b7f9f; }
        .summary-value { margin-top: 6px; font-size: 20px; font-weight: 800; color: #10213d; }
        .panel-body {
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          display: grid;
          grid-template-rows: auto auto auto minmax(0, 1fr);
          gap: 12px;
          padding: 14px 18px 18px;
          align-content: start;
        }
        .panel-body::-webkit-scrollbar { width: 10px; }
        .panel-body::-webkit-scrollbar-thumb {
          border: 3px solid transparent;
          border-radius: 999px;
          background: rgba(27, 71, 151, 0.18);
          background-clip: padding-box;
        }
        .section {
          display: grid;
          gap: 10px;
          padding: 14px;
          border: 1px solid rgba(27, 71, 151, 0.08);
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.92);
        }
        .section-title {
          font-size: 11px;
          font-weight: 800;
          color: #6b7f9f;
          letter-spacing: 0.06em;
          line-height: 1.3;
        }
        .mode-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }
        .mode-button,
        .action-button {
          border: 1px solid rgba(27, 71, 151, 0.10);
          border-radius: 16px;
          min-height: 54px;
          padding: 12px 10px;
          background: rgba(247, 250, 255, 0.98);
          color: #29456f;
          cursor: pointer;
          font: inherit;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          line-height: 1.32;
          white-space: normal;
          word-break: keep-all;
          overflow-wrap: anywhere;
        }
        .mode-button.is-active {
          border-color: transparent;
          background: linear-gradient(135deg, #1b4797, #2f6ad8);
          color: #ffffff;
          box-shadow: 0 12px 24px rgba(27, 71, 151, 0.18);
        }
        .action-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .action-grid.secondary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .action-button.primary {
          border-color: transparent;
          background: linear-gradient(135deg, #1b4797, #2f6ad8);
          color: #ffffff;
          box-shadow: 0 12px 24px rgba(27, 71, 151, 0.18);
        }
        .action-button.accent {
          border-color: rgba(27, 71, 151, 0.12);
          background: rgba(233, 241, 255, 0.98);
          color: #1b4797;
        }
        .action-button:disabled,
        .mode-button:disabled,
        .mini-button:disabled { opacity: 0.42; cursor: not-allowed; }
        .queue-box {
          padding: 12px;
          border-radius: 18px;
          background: rgba(244, 248, 255, 0.94);
          display: grid;
          gap: 10px;
        }
        .queue-text { color: #29456f; min-height: 18px; }
        .queue-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }
        .queue-stat {
          padding: 8px 10px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.94);
        }
        .queue-stat-label { font-size: 10px; color: #6b7f9f; }
        .queue-stat-value { margin-top: 3px; font-size: 15px; font-weight: 800; color: #10213d; }
        .progress-track {
          height: 8px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(27, 71, 151, 0.08);
        }
        .progress-bar {
          width: 0%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #1b4797, #2f6ad8);
          transition: width 0.16s ease;
        }
        .selected-shell { min-height: 0; display: grid; gap: 10px; }
        .selected-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          color: #6b7f9f;
        }
        .selected-list {
          min-height: 0;
          overflow: visible;
          display: grid;
          gap: 8px;
          padding-right: 2px;
        }
        .selected-empty {
          padding: 16px;
          border-radius: 16px;
          text-align: center;
          color: #6b7f9f;
          background: rgba(244, 248, 255, 0.98);
        }
        .selected-item {
          display: grid;
          grid-template-columns: 62px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 8px;
          border-radius: 18px;
          border: 1px solid rgba(27, 71, 151, 0.08);
          background: rgba(255, 255, 255, 0.98);
        }
        .selected-thumb {
          width: 62px;
          height: 62px;
          border-radius: 14px;
          object-fit: cover;
          background: rgba(244, 248, 255, 0.98);
        }
        .selected-meta { min-width: 0; display: grid; gap: 3px; }
        .selected-order { font-size: 11px; font-weight: 800; color: #6b7f9f; }
        .selected-label {
          font-size: 12px;
          color: #10213d;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .selected-sub { font-size: 11px; color: #7b8eab; }
        .remove-button {
          border: 1px solid rgba(27, 71, 151, 0.10);
          border-radius: 999px;
          width: 30px;
          height: 30px;
          background: rgba(244, 248, 255, 0.98);
          color: #56719d;
          cursor: pointer;
        }
        .toast-stack {
          pointer-events: none;
          position: fixed;
          right: 20px;
          bottom: 96px;
          z-index: 60;
          display: grid;
          gap: 8px;
          width: 280px;
        }
        .toast {
          padding: 12px 14px;
          border-radius: 16px;
          color: #ffffff;
          background: rgba(15, 23, 42, 0.94);
          box-shadow: 0 16px 38px rgba(15, 23, 42, 0.18);
          font: 700 12px/1.4 "Segoe UI", system-ui, sans-serif;
        }
        .toast.error { background: rgba(179, 38, 30, 0.96); }
        .toast.success { background: rgba(27, 71, 151, 0.96); }
      </style>

      <button id="ppd-launcher" class="launcher" type="button">선택 시작</button>
      <div id="ppd-mini-bar" class="mini-bar" aria-live="polite">
        <div id="ppd-mini-count" class="mini-pill">선택 0개</div>
        <div class="mini-actions">
          <button class="mini-button" data-action="togglePanel" type="button">패널</button>
          <button class="mini-button primary" data-action="download" type="button">다운로드</button>
          <button class="mini-button" data-action="clear" type="button">전체 해제</button>
          <button class="mini-button danger" data-action="deactivate" type="button">종료</button>
        </div>
      </div>
      <aside id="ppd-panel" class="panel" aria-live="polite">
        <header class="panel-header">
          <div class="panel-title-row">
            <h1 class="panel-title">Pinterest 이미지 선택</h1>
            <button class="close-button" data-action="closePanel" type="button">×</button>
          </div>
          <div id="ppd-status" class="status-box">선택 모드를 시작해 주세요.</div>
        </header>
        <div class="summary-grid">
          <div class="summary-card"><div class="summary-label">감지</div><div id="ppd-detected-value" class="summary-value">0</div></div>
          <div class="summary-card"><div class="summary-label">선택</div><div id="ppd-selected-value" class="summary-value">0</div></div>
          <div class="summary-card"><div class="summary-label">메인</div><div id="ppd-main-value" class="summary-value">N</div></div>
        </div>
        <div class="panel-body">
          <section class="section">
            <div class="section-title">선택 방식</div>
            <div class="mode-row">
              <button id="ppd-mode-cumulative" class="mode-button" data-mode="cumulative" type="button">누적 선택</button>
              <button id="ppd-mode-visible" class="mode-button" data-mode="visible" type="button">현재 화면만</button>
            </div>
          </section>
          <section class="section">
            <div class="section-title">빠른 작업</div>
            <div class="action-grid">
              <button class="action-button" data-action="rescan" type="button">다시 스캔</button>
              <button class="action-button" data-action="selectAll" type="button">현재 화면 전체</button>
              <button class="action-button" data-action="clear" type="button">선택 해제</button>
            </div>
            <div class="action-grid secondary">
              <button id="ppd-download-button" class="action-button primary" data-action="download" type="button">선택 이미지 다운로드</button>
              <button id="ppd-retry-button" class="action-button accent" data-action="retryFailed" type="button">실패만 재시도</button>
            </div>
          </section>
          <section class="section">
            <div class="section-title">다운로드 진행</div>
            <div class="queue-box">
              <div id="ppd-queue-text" class="queue-text">PNG 저장 대기 중</div>
              <div id="ppd-queue-stats" class="queue-stats"></div>
              <div class="progress-track"><div id="ppd-queue-progress" class="progress-bar"></div></div>
            </div>
          </section>
          <section class="section selected-shell">
            <div class="selected-topline">
              <div class="section-title">선택 목록</div>
              <div id="ppd-selected-caption">스크롤해도 유지됩니다.</div>
            </div>
            <div id="ppd-selected-list" class="selected-list"></div>
            <div id="ppd-selected-empty" class="selected-empty">아직 선택한 이미지가 없습니다.</div>
          </section>
        </div>
      </aside>
      <div id="ppd-toast-stack" class="toast-stack"></div>
    `;

    ui.host = host;
    ui.shadow = shadow;
    ui.launcher = shadow.getElementById('ppd-launcher');
    ui.miniBar = shadow.getElementById('ppd-mini-bar');
    ui.miniCount = shadow.getElementById('ppd-mini-count');
    ui.panel = shadow.getElementById('ppd-panel');
    ui.status = shadow.getElementById('ppd-status');
    ui.detectedValue = shadow.getElementById('ppd-detected-value');
    ui.selectedValue = shadow.getElementById('ppd-selected-value');
    ui.mainValue = shadow.getElementById('ppd-main-value');
    ui.modeCumulative = shadow.getElementById('ppd-mode-cumulative');
    ui.modeVisible = shadow.getElementById('ppd-mode-visible');
    ui.queueText = shadow.getElementById('ppd-queue-text');
    ui.queueStats = shadow.getElementById('ppd-queue-stats');
    ui.queueProgress = shadow.getElementById('ppd-queue-progress');
    ui.selectedList = shadow.getElementById('ppd-selected-list');
    ui.selectedEmpty = shadow.getElementById('ppd-selected-empty');
    ui.retryButton = shadow.getElementById('ppd-retry-button');
    ui.downloadButton = shadow.getElementById('ppd-download-button');
    ui.toastStack = shadow.getElementById('ppd-toast-stack');
    ui.selectedItemNodes = new Map();
  }

  function bindUiEvents() {
    ui.launcher.addEventListener('click', async () => {
      if (state.isActive) {
        runtime.deactivateSelectionMode();
        runtime.showToast('선택 모드를 종료했습니다.');
        return;
      }

      await runtime.activateSelectionMode();
    });

    ui.shadow.addEventListener('click', async (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }

      const mode = target.closest(`[${MODE_ATTR}]`)?.getAttribute(MODE_ATTR);
      if (mode) {
        runtime.setSelectionMode(mode);
        return;
      }

      const action = target.closest(`[${ACTION_ATTR}]`)?.getAttribute(ACTION_ATTR);
      if (!action) {
        return;
      }

      if (action === 'togglePanel') {
        state.panelOpen = !state.panelOpen;
        renderAll();
        return;
      }

      if (action === 'closePanel') {
        state.panelOpen = false;
        renderAll();
        return;
      }

      if (action === 'deactivate') {
        runtime.deactivateSelectionMode();
        runtime.showToast('선택 모드를 종료했습니다.');
        return;
      }

      if (action === 'rescan') {
        await runtime.refreshScan({ autoSelectMain: false });
        runtime.showToast('이미지 목록을 다시 스캔했습니다.');
        return;
      }

      if (action === 'selectAll') {
        runtime.selectAllVisible();
        runtime.showToast(`현재 화면 이미지 ${state.visibleItems.length}개를 담았습니다.`);
        return;
      }

      if (action === 'clear') {
        runtime.clearSelection();
        return;
      }

      if (action === 'download') {
        await runtime.startDownload();
        return;
      }

      if (action === 'retryFailed') {
        await runtime.retryFailedDownloads();
        return;
      }

      if (action === 'removeSelected') {
        const selectionKey = target.closest('[data-selection-key]')?.getAttribute('data-selection-key');
        if (selectionKey) {
          runtime.removeSelection(selectionKey, true);
        }
      }
    });
  }

  function bindRuntimeEvents() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== 'string') {
        return false;
      }

      if (message.type === 'PING') {
        sendResponse({ ok: true, version: INJECTED_FLAG });
        return false;
      }

      if (message.type === 'GET_PAGE_STATE') {
        sendResponse(runtime.getSnapshot());
        return false;
      }

      if (message.type === 'ACTIVATE_SELECTION_MODE') {
        runtime.activateSelectionMode()
          .then(() => sendResponse(runtime.getSnapshot()))
          .catch((error) => sendResponse({ ...runtime.getSnapshot(), ok: false, error: error.message }));
        return true;
      }

      if (message.type === 'DEACTIVATE_SELECTION_MODE') {
        runtime.deactivateSelectionMode();
        sendResponse(runtime.getSnapshot());
        return false;
      }

      if (message.type === 'RESCAN_IMAGES') {
        runtime.refreshScan({ autoSelectMain: false })
          .then(() => sendResponse(runtime.getSnapshot()))
          .catch((error) => sendResponse({ ...runtime.getSnapshot(), ok: false, error: error.message }));
        return true;
      }

      if (message.type === 'SELECT_ALL_VISIBLE') {
        runtime.selectAllVisible();
        sendResponse(runtime.getSnapshot());
        return false;
      }

      if (message.type === 'CLEAR_SELECTION') {
        runtime.clearSelection();
        sendResponse(runtime.getSnapshot());
        return false;
      }

      if (message.type === 'DOWNLOAD_SELECTED') {
        runtime.startDownload()
          .then(() => sendResponse(runtime.getSnapshot()))
          .catch((error) => sendResponse({ ...runtime.getSnapshot(), ok: false, error: error.message }));
        return true;
      }

      if (message.type === 'RETRY_FAILED_DOWNLOADS') {
        runtime.retryFailedDownloads()
          .then(() => sendResponse(runtime.getSnapshot()))
          .catch((error) => sendResponse({ ...runtime.getSnapshot(), ok: false, error: error.message }));
        return true;
      }

      if (message.type === 'SETTINGS_UPDATED') {
        state.settings = runtime.normalizeSettings(message.settings);
        sendResponse(runtime.getSnapshot());
        return false;
      }

      if (message.type === 'DOWNLOAD_PROGRESS') {
        runtime.applyDownloadProgress(message.payload);
        sendResponse({ ok: true });
        return false;
      }

      return false;
    });
  }

  function bindWindowEvents() {
    window.addEventListener(
      'scroll',
      () => {
        if (!state.isActive) {
          return;
        }

        runtime.scheduleRescan(24, {
          invalidateSources: true,
          reason: 'scroll'
        });
      },
      { passive: true }
    );

    window.addEventListener('resize', () => {
      if (!state.isActive) {
        return;
      }

      runtime.scheduleRescan(70, {
        invalidateSources: true,
        reason: 'resize'
      });
    });

    window.addEventListener('popstate', () => {
      if (!state.isActive) {
        return;
      }

      runtime.scheduleRescan(50, {
        invalidateSources: true,
        reason: 'navigation'
      });
    });

    window.addEventListener('hashchange', () => {
      if (!state.isActive) {
        return;
      }

      runtime.scheduleRescan(50, {
        invalidateSources: true,
        reason: 'navigation'
      });
    });

    document.addEventListener(
      'load',
      (event) => {
        if (!state.isActive) {
          return;
        }

        if (event.target instanceof HTMLImageElement) {
          runtime.scheduleRescan(50, {
            invalidateSources: true,
            reason: 'load'
          });
        }
      },
      true
    );

    document.addEventListener(
      'click',
      (event) => {
        if (!state.isActive || event.button !== 0) {
          return;
        }

        const target = event.target instanceof HTMLElement ? event.target : null;
        if (!target) {
          return;
        }

        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        if (path.includes(ui.host)) {
          return;
        }

        if (path.some((node) => node instanceof HTMLElement && node.hasAttribute?.(TOGGLE_ATTR))) {
          return;
        }

        const interactive = target.closest('button, [role="button"], input, textarea, select, summary, details');
        if (interactive && !interactive.hasAttribute(TOGGLE_ATTR)) {
          return;
        }

        const anchor = target.closest('a[href*="/pin/"]');
        if (!(anchor instanceof HTMLAnchorElement)) {
          return;
        }

        const item = runtime.getVisibleItemByAnchor(anchor) || runtime.buildVisibleItemFromAnchor(anchor);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (item) {
          runtime.toggleSelectionForItem(item, false);
          return;
        }

        runtime.scheduleRescan(0, {
          invalidateSources: true,
          reason: 'manual'
        });
      },
      true
    );

    document.addEventListener(
      'keydown',
      (event) => {
        if (!state.isActive || runtime.shouldIgnoreShortcut(event)) {
          return;
        }

        const key = event.key.toLowerCase();
        if (key === 'a') {
          event.preventDefault();
          runtime.selectAllVisible();
          runtime.showToast('단축키 A: 현재 화면 전체 선택');
        } else if (key === 'c') {
          event.preventDefault();
          runtime.clearSelection();
        } else if (key === 'd') {
          event.preventDefault();
          runtime.startDownload().catch(() => undefined);
        } else if (key === 'r') {
          event.preventDefault();
          runtime.refreshScan({ autoSelectMain: false }).catch(() => undefined);
          runtime.showToast('단축키 R: 다시 스캔');
        }
      },
      true
    );
  }

  function renderAll() {
    renderFrameState();
    renderStatus();
    renderSummary();
    renderModeButtons();
    renderQueue();
    renderSelectedList();
    runtime.updateDecorationState();
  }

  function renderFrameState() {
    ui.launcher.textContent = state.isActive ? '선택 종료' : '선택 시작';
    ui.launcher.classList.toggle('is-hidden', state.isActive);
    ui.miniBar.classList.toggle('is-visible', state.isActive);
    ui.panel.classList.toggle('is-open', state.isActive && state.panelOpen);
    ui.miniCount.textContent = `선택 ${state.selectedOrder.length}개`;
  }

  function renderStatus() {
    const mainFound = state.visibleItems.some((item) => item.role === 'main');
    let message = '선택 모드를 시작하면 카드 클릭으로 이미지를 담을 수 있습니다.';
    let isError = false;

    if (state.isActive && !mainFound) {
      message = '메인 이미지를 아직 찾지 못했습니다. 핀 상세 화면에서 다시 스캔해 주세요.';
      isError = true;
    } else if (state.isActive) {
      message =
        state.selectionMode === 'cumulative'
          ? `메인 포함 ${state.visibleItems.length}개 감지됨. 스크롤해도 선택이 유지됩니다.`
          : `현재 화면 기준 ${state.visibleItems.length}개 감지됨. 화면 밖 선택은 유지되지 않습니다.`;
    }

    runtime.setStatus(message, isError);
  }

  function renderSummary() {
    ui.detectedValue.textContent = String(state.visibleItems.length);
    ui.selectedValue.textContent = String(state.selectedOrder.length);
    ui.mainValue.textContent = state.visibleItems.some((item) => item.role === 'main') ? 'Y' : 'N';
  }

  function renderModeButtons() {
    ui.modeCumulative.classList.toggle('is-active', state.selectionMode === 'cumulative');
    ui.modeVisible.classList.toggle('is-active', state.selectionMode === 'visible');
  }

  function renderQueue() {
    const total = Number(state.downloadState.total || 0);
    const processed = Number(state.downloadState.processed || 0);
    const failed = Number(state.downloadState.failed || 0);
    const remaining = total > 0 ? Math.max(0, total - processed - failed) : 0;
    const finished = total > 0 ? processed + failed : 0;
    const percent = total > 0 ? Math.min(100, Math.round((finished / total) * 100)) : 0;

    ui.downloadButton.disabled = state.selectedOrder.length === 0 || state.downloadState.status === 'running';
    ui.retryButton.disabled = !state.downloadState.canRetryFailed || state.downloadState.status === 'running';
    ui.queueText.textContent = state.downloadState.message || 'PNG 저장 대기 중';
    ui.queueStats.innerHTML = `
      <div class="queue-stat"><div class="queue-stat-label">총 개수</div><div class="queue-stat-value">${total}</div></div>
      <div class="queue-stat"><div class="queue-stat-label">완료</div><div class="queue-stat-value">${processed}</div></div>
      <div class="queue-stat"><div class="queue-stat-label">실패</div><div class="queue-stat-value">${failed}</div></div>
      <div class="queue-stat"><div class="queue-stat-label">남음</div><div class="queue-stat-value">${remaining}</div></div>
    `;
    ui.queueProgress.style.width = `${percent}%`;
  }

  function renderSelectedList() {
    const entries = state.selectedOrder
      .map((selectionKey, index) => ({
        order: index + 1,
        entry: state.selectedMap.get(selectionKey)
      }))
      .filter((item) => Boolean(item.entry));

    ui.selectedEmpty.style.display = entries.length ? 'none' : 'block';
    ui.selectedList.style.display = entries.length ? 'grid' : 'none';

    if (!entries.length) {
      clearSelectedListNodes();
      return;
    }

    const activeKeys = new Set();
    let nextSibling = ui.selectedList.firstElementChild;

    for (const { order, entry } of entries) {
      activeKeys.add(entry.selectionKey);
      const node = ui.selectedItemNodes.get(entry.selectionKey) || createSelectedItemNode(entry.selectionKey);
      updateSelectedItemNode(node, entry, order);

      if (node !== nextSibling) {
        ui.selectedList.insertBefore(node, nextSibling);
      } else {
        nextSibling = nextSibling?.nextElementSibling || null;
      }

      nextSibling = node.nextElementSibling;
    }

    for (const [selectionKey, node] of [...ui.selectedItemNodes.entries()]) {
      if (activeKeys.has(selectionKey)) {
        continue;
      }

      node.remove();
      ui.selectedItemNodes.delete(selectionKey);
    }
  }

  function createSelectedItemNode(selectionKey) {
    const item = document.createElement('div');
    item.className = 'selected-item';
    item.dataset.selectionKey = selectionKey;

    const thumb = document.createElement('img');
    thumb.className = 'selected-thumb';
    thumb.alt = '';

    const meta = document.createElement('div');
    meta.className = 'selected-meta';

    const order = document.createElement('div');
    order.className = 'selected-order';

    const label = document.createElement('div');
    label.className = 'selected-label';

    const sub = document.createElement('div');
    sub.className = 'selected-sub';

    meta.append(order, label, sub);

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-button';
    removeButton.type = 'button';
    removeButton.setAttribute('data-action', 'removeSelected');
    removeButton.textContent = '×';

    item.append(thumb, meta, removeButton);
    item._ppdRefs = { thumb, order, label, sub };

    ui.selectedItemNodes.set(selectionKey, item);
    return item;
  }

  function updateSelectedItemNode(node, entry, order) {
    const refs = node._ppdRefs;
    const labelText = entry.label || runtime.getFallbackLabel(entry);
    const roleText = entry.role === 'main' ? '메인 이미지' : '유사 이미지';
    const thumbUrl = entry.thumbnailUrl || entry.imageUrl || '';
    const pinKeyText = entry.pinKey || 'pin key 없음';
    const orderText = `#${order} · ${roleText}`;

    node.dataset.selectionKey = entry.selectionKey;

    if (thumbUrl) {
      if (refs.thumb.getAttribute('src') !== thumbUrl) {
        refs.thumb.setAttribute('src', thumbUrl);
      }
    } else {
      refs.thumb.removeAttribute('src');
    }

    if (refs.order.textContent !== orderText) {
      refs.order.textContent = orderText;
    }

    if (refs.label.textContent !== labelText) {
      refs.label.textContent = labelText;
    }

    if (refs.sub.textContent !== pinKeyText) {
      refs.sub.textContent = pinKeyText;
    }
  }

  function clearSelectedListNodes() {
    for (const node of ui.selectedItemNodes.values()) {
      node.remove();
    }

    ui.selectedItemNodes.clear();
  }
})();
