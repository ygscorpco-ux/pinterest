(function registerPpdSelectionModule() {
  const runtime = globalThis.__PPD_CONTENT_RUNTIME__;
  if (!runtime || runtime.initialized || runtime.modules.selection) {
    return;
  }

  runtime.modules.selection = true;

  const { state } = runtime;

  runtime.activateSelectionMode = activateSelectionMode;
  runtime.deactivateSelectionMode = deactivateSelectionMode;
  runtime.addSelection = addSelection;
  runtime.removeSelection = removeSelection;
  runtime.ensureVisibleItem = ensureVisibleItem;
  runtime.toggleSelectionForItem = toggleSelectionForItem;
  runtime.toggleSelection = toggleSelection;
  runtime.selectAllVisible = selectAllVisible;
  runtime.clearSelection = clearSelection;
  runtime.pruneSelectionToVisible = pruneSelectionToVisible;
  runtime.reconcileSelections = reconcileSelections;
  runtime.startDownload = startDownload;
  runtime.retryFailedDownloads = retryFailedDownloads;
  runtime.buildSelectedDownloadItems = buildSelectedDownloadItems;
  runtime.applyDownloadProgress = applyDownloadProgress;
  runtime.setSelectionMode = setSelectionMode;
  runtime.buildSelectionEntry = buildSelectionEntry;
  runtime.appendSelectedOrder = appendSelectedOrder;
  runtime.removeSelectionOrder = removeSelectionOrder;

  async function activateSelectionMode() {
    state.isActive = true;
    state.panelOpen = false;

    const scope = runtime.getSelectionScope();
    if (state.lastScope && state.lastScope !== scope) {
      clearSelection(true);
      runtime.resetDownloadState();
    }

    state.lastScope = scope;
    runtime.invalidateScanSourceCache();
    await runtime.refreshScan({ autoSelectMain: state.selectedOrder.length === 0 });
    runtime.startObserver();
    runtime.renderAll();
    runtime.showToast('선택 모드를 시작했습니다.', 'success');
  }

  function deactivateSelectionMode() {
    state.isActive = false;
    runtime.stopObserver();
    runtime.clearDecorations();
    runtime.renderAll();
  }

  function addSelection(item, announce) {
    const existing = state.selectedMap.get(item.selectionKey);
    state.selectedMap.set(item.selectionKey, buildSelectionEntry(item, existing));
    appendSelectedOrder(item.selectionKey);

    if (announce) {
      runtime.showToast(`${state.selectedOrder.length}개 선택됨`, 'success', 950);
    }
  }

  function removeSelection(selectionKey, announce) {
    if (!state.selectedMap.has(selectionKey)) {
      return;
    }

    state.selectedMap.delete(selectionKey);
    removeSelectionOrder(selectionKey);
    runtime.updateDecorationState();
    runtime.renderAll();

    if (announce) {
      runtime.showToast(`선택 해제됨 (${state.selectedOrder.length}개 남음)`, 'info', 900);
    }
  }

  function ensureVisibleItem(item) {
    if (!item || !item.selectionKey) {
      return null;
    }

    const existing = runtime.getVisibleItemBySelectionKey(item.selectionKey);
    if (existing) {
      return existing;
    }

    runtime.syncVisibleState([...state.visibleItems, item]);
    runtime.decorateItem(item);
    return item;
  }

  function toggleSelectionForItem(item, announce) {
    if (!item?.selectionKey) {
      return;
    }

    if (state.selectedMap.has(item.selectionKey)) {
      removeSelection(item.selectionKey, announce);
      return;
    }

    const targetItem = ensureVisibleItem(item) || item;
    addSelection(targetItem, announce);
    runtime.updateDecorationState();
    runtime.renderAll();
  }

  function toggleSelection(selectionKey, announce) {
    const item = runtime.getVisibleItemBySelectionKey(selectionKey);
    if (!item) {
      return;
    }

    toggleSelectionForItem(item, announce);
  }

  function selectAllVisible() {
    for (const item of state.visibleItems) {
      addSelection(item, false);
    }

    runtime.updateDecorationState();
    runtime.renderAll();
  }

  function clearSelection(silent) {
    state.selectedMap.clear();
    state.selectedOrder = [];
    runtime.updateDecorationState();
    runtime.renderAll();

    if (!silent) {
      runtime.showToast('선택을 모두 해제했습니다.');
    }
  }

  function pruneSelectionToVisible(visibleItems) {
    const visibleKeys = new Set(visibleItems.map((item) => item.selectionKey));
    let removed = 0;

    for (const selectionKey of [...state.selectedOrder]) {
      if (visibleKeys.has(selectionKey)) {
        continue;
      }

      state.selectedMap.delete(selectionKey);
      removeSelectionOrder(selectionKey);
      removed += 1;
    }

    if (removed > 0) {
      runtime.showToast(`현재 화면 밖 선택 ${removed}개를 정리했습니다.`);
    }
  }

  function reconcileSelections(visibleItems) {
    for (const item of visibleItems) {
      const existing = state.selectedMap.get(item.selectionKey);
      if (!existing) {
        continue;
      }

      state.selectedMap.set(item.selectionKey, buildSelectionEntry(item, existing));
    }
  }

  async function startDownload() {
    if (!state.selectedOrder.length) {
      runtime.setStatus('먼저 다운로드할 이미지를 선택해 주세요.', true);
      runtime.showToast('선택된 이미지가 없습니다.', 'error');
      return;
    }

    state.settings = await runtime.getSettings();
    runtime.resetDownloadState();
    state.downloadState.status = 'running';
    state.downloadState.message = `PNG 다운로드 요청 중 (${state.selectedOrder.length}개)`;
    runtime.renderAll();

    const response = await chrome.runtime.sendMessage({
      type: 'DOWNLOAD_IMAGES',
      items: buildSelectedDownloadItems(),
      settings: state.settings
    });

    if (!response?.ok) {
      state.downloadState.status = 'error';
      state.downloadState.message = response?.error || '다운로드 요청에 실패했습니다.';
      runtime.renderAll();
      runtime.showToast(state.downloadState.message, 'error');
      return;
    }

    state.downloadState.total = response.total || state.selectedOrder.length;
    state.downloadState.remaining = state.downloadState.total;
    runtime.renderAll();
  }

  async function retryFailedDownloads() {
    state.settings = await runtime.getSettings();
    state.downloadState.status = 'running';
    state.downloadState.message = '실패 항목 재시도 요청 중';
    runtime.renderAll();

    const response = await chrome.runtime.sendMessage({
      type: 'RETRY_FAILED_DOWNLOADS',
      settings: state.settings
    });

    if (!response?.ok) {
      state.downloadState.status = 'error';
      state.downloadState.message = response?.error || '재시도 요청에 실패했습니다.';
      runtime.renderAll();
      runtime.showToast(state.downloadState.message, 'error');
      return;
    }

    state.downloadState.total = response.total || state.downloadState.total || 0;
    state.downloadState.remaining = state.downloadState.total;
    runtime.renderAll();
  }

  function buildSelectedDownloadItems() {
    return state.selectedOrder
      .map((selectionKey) => state.selectedMap.get(selectionKey))
      .filter(Boolean)
      .map((entry) => ({
        selectionKey: entry.selectionKey,
        pinKey: entry.pinKey,
        pinUrl: entry.pinUrl,
        imageUrl: entry.imageUrl,
        thumbnailUrl: entry.thumbnailUrl,
        label: entry.label,
        role: entry.role
      }));
  }

  function applyDownloadProgress(payload) {
    state.downloadState = {
      ...runtime.createDownloadState(),
      ...state.downloadState,
      ...payload
    };

    runtime.renderAll();

    if (payload?.status === 'completed') {
      runtime.showToast(payload.message || '다운로드가 완료되었습니다.', payload.failed > 0 ? 'info' : 'success');
    } else if (payload?.status === 'error') {
      runtime.showToast(payload.message || '다운로드 중 오류가 발생했습니다.', 'error');
    }
  }

  function setSelectionMode(nextMode) {
    if (nextMode !== 'cumulative' && nextMode !== 'visible') {
      return;
    }

    if (state.selectionMode === nextMode) {
      return;
    }

    state.selectionMode = nextMode;
    if (nextMode === 'visible') {
      pruneSelectionToVisible(state.visibleItems);
    }

    runtime.renderAll();
    runtime.showToast(nextMode === 'cumulative' ? '누적 선택 모드로 전환했습니다.' : '현재 화면만 선택 모드로 전환했습니다.');
  }

  function buildSelectionEntry(item, existing) {
    return {
      selectionKey: item.selectionKey,
      pinKey: item.pinKey,
      pinUrl: item.pinUrl || existing?.pinUrl || '',
      imageUrl: runtime.choosePreferredUrl(existing?.imageUrl, item.imageUrl),
      thumbnailUrl: item.thumbnailUrl || existing?.thumbnailUrl || item.imageUrl,
      role: existing?.role === 'main' || item.role === 'main' ? 'main' : 'similar',
      label: item.label || existing?.label || runtime.getFallbackLabel(item)
    };
  }

  function appendSelectedOrder(selectionKey) {
    if (!state.selectedOrder.includes(selectionKey)) {
      state.selectedOrder.push(selectionKey);
    }
  }

  function removeSelectionOrder(selectionKey) {
    state.selectedOrder = state.selectedOrder.filter((key) => key !== selectionKey);
  }
})();
