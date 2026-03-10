const pageStatus = document.getElementById('page-status');
const downloadStatus = document.getElementById('download-status');
const detectedCount = document.getElementById('detected-count');
const selectedCount = document.getElementById('selected-count');
const mainFound = document.getElementById('main-found');
const activateButton = document.getElementById('activate-button');
const rescanButton = document.getElementById('rescan-button');
const selectAllButton = document.getElementById('select-all-button');
const clearButton = document.getElementById('clear-button');
const downloadButton = document.getElementById('download-button');
const retryButton = document.getElementById('retry-button');
const prefixInput = document.getElementById('prefix-input');

const CONTENT_SCRIPT_FILES = ['content/content.js', 'content/scan.js', 'content/selection.js', 'content/ui.js'];

let currentTabId = null;
let refreshTimer = 0;
let currentState = null;

init().catch((error) => {
  setPageStatus(error.message || '초기화에 실패했습니다.', true);
});

window.addEventListener('unload', () => {
  if (refreshTimer) {
    window.clearInterval(refreshTimer);
  }
});

async function init() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab?.id) {
    setPageStatus('현재 탭을 찾지 못했습니다.', true);
    disableControls(true);
    return;
  }

  currentTabId = tab.id;

  const settingsResponse = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
  applySettings(normalizeSettings(settingsResponse?.settings));

  if (!isPinterestUrl(tab.url)) {
    setPageStatus('Pinterest 페이지에서만 사용할 수 있습니다.', true);
    disableControls(true);
    return;
  }

  disableControls(false);
  await ensureContentScriptInjected(currentTabId);
  bindUiEvents();
  await refreshState();
  startAutoRefresh();
}

function bindUiEvents() {
  activateButton.addEventListener('click', async () => {
    if (currentState?.isActive) {
      await sendCommand('DEACTIVATE_SELECTION_MODE');
      return;
    }

    const response = await sendCommand('ACTIVATE_SELECTION_MODE');
    if (!response?.error) {
      window.setTimeout(() => window.close(), 80);
    }
  });

  rescanButton.addEventListener('click', async () => {
    await sendCommand('RESCAN_IMAGES');
  });

  selectAllButton.addEventListener('click', async () => {
    await sendCommand('SELECT_ALL_VISIBLE');
  });

  clearButton.addEventListener('click', async () => {
    await sendCommand('CLEAR_SELECTION');
  });

  downloadButton.addEventListener('click', async () => {
    await sendCommand('DOWNLOAD_SELECTED');
  });

  retryButton.addEventListener('click', async () => {
    await sendCommand('RETRY_FAILED_DOWNLOADS');
  });

  prefixInput.addEventListener('change', async () => {
    await persistSettings();
  });
}

async function sendCommand(type) {
  if (!currentTabId) {
    return null;
  }

  await ensureContentScriptInjected(currentTabId);

  if (!['ACTIVATE_SELECTION_MODE', 'DEACTIVATE_SELECTION_MODE', 'RETRY_FAILED_DOWNLOADS'].includes(type) && currentState?.isActive !== true) {
    const activated = await chrome.tabs.sendMessage(currentTabId, { type: 'ACTIVATE_SELECTION_MODE' });
    renderState(activated);
  }

  const response = await chrome.tabs.sendMessage(currentTabId, { type });
  if (response?.error) {
    setDownloadStatus(response.error, true);
  }

  renderState(response);
  return response;
}

async function refreshState() {
  if (!currentTabId) {
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(currentTabId, { type: 'GET_PAGE_STATE' });
    renderState(response);
  } catch (error) {
    setPageStatus('페이지 스크립트와 연결하지 못했습니다. 탭을 새로고침해 주세요.', true);
  }
}

function renderState(state) {
  if (!state?.ok) {
    setPageStatus('Pinterest 페이지 상태를 읽지 못했습니다.', true);
    return;
  }

  currentState = state;
  const detailReady = Boolean(state.mainFound);
  const activeText = state.isActive ? '선택 모드 실행 중' : '선택 모드 대기 중';
  const detailText = detailReady ? '메인 감지됨' : '메인 미감지';
  setPageStatus(`${activeText} / ${detailText}`);

  detectedCount.textContent = String(state.detectedCount ?? 0);
  selectedCount.textContent = String(state.selectedCount ?? 0);
  mainFound.textContent = detailReady ? 'Y' : 'N';
  activateButton.textContent = state.isActive ? '선택 모드 종료' : '선택 모드 시작';

  const progress = state.downloadState || {};
  retryButton.disabled = !progress.canRetryFailed || progress.status === 'running';

  if (progress.status === 'running') {
    setDownloadStatus(progress.message || '다운로드 진행 중');
    return;
  }

  if (progress.status === 'completed') {
    setDownloadStatus(progress.message || '다운로드 완료');
    return;
  }

  if (progress.status === 'error') {
    setDownloadStatus(progress.message || '다운로드 오류', true);
    return;
  }

  setDownloadStatus('PNG 저장 대기 중');
}

function applySettings(settings) {
  prefixInput.value = settings.filenamePrefix;
}

async function persistSettings() {
  const settings = normalizeSettings({
    filenamePrefix: prefixInput.value
  });

  const response = await chrome.runtime.sendMessage({
    type: 'SAVE_SETTINGS',
    settings
  });

  const nextSettings = response?.settings || settings;
  applySettings(nextSettings);

  if (currentTabId) {
    try {
      await chrome.tabs.sendMessage(currentTabId, {
        type: 'SETTINGS_UPDATED',
        settings: nextSettings
      });
    } catch (error) {
      chrome.runtime.lastError;
    }
  }
}

async function ensureContentScriptInjected(tabId) {
  const existing = await pingContentScript(tabId);
  if (existing?.ok) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await wait(40);
    const ping = await pingContentScript(tabId);
    if (ping?.ok) {
      return;
    }
  }

  throw new Error('페이지 스크립트를 초기화하지 못했습니다. 확장프로그램과 페이지를 새로고침해 주세요.');
}

async function pingContentScript(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch (error) {
    chrome.runtime.lastError;
    return null;
  }
}

function startAutoRefresh() {
  refreshTimer = window.setInterval(() => {
    refreshState().catch(() => undefined);
  }, 1200);
}

function disableControls(disabled) {
  for (const element of [
    activateButton,
    rescanButton,
    selectAllButton,
    clearButton,
    downloadButton,
    retryButton,
    prefixInput
  ]) {
    element.disabled = disabled;
  }
}

function setPageStatus(message, isError) {
  pageStatus.textContent = message;
  pageStatus.classList.toggle('error', Boolean(isError));
}

function setDownloadStatus(message, isError) {
  downloadStatus.textContent = message;
  downloadStatus.classList.toggle('error', Boolean(isError));
}

function isPinterestUrl(url) {
  return typeof url === 'string' && /:\/\/([a-z0-9-]+\.)?pinterest\.com\//i.test(url);
}

function normalizeSettings(settings) {
  return {
    filenamePrefix: String(settings?.filenamePrefix || 'pinterest').trim() || 'pinterest'
  };
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
