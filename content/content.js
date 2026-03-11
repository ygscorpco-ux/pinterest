(function registerPpdRuntime() {
  const GLOBAL_KEY = '__PPD_CONTENT_RUNTIME__';
  const existingRuntime = globalThis[GLOBAL_KEY];
  if (existingRuntime?.initialized || existingRuntime?.initializationPromise) {
    return;
  }

  const DEFAULT_SETTINGS = {
    filenamePrefix: 'pinterest'
  };

  function createScanSourceCache() {
    return {
      dirty: true,
      scopeKey: location.href,
      images: [],
      anchors: [],
      lastPrunedAt: 0
    };
  }

  function createDownloadState() {
    return {
      status: 'idle',
      message: '대기 중',
      processed: 0,
      total: 0,
      failed: 0,
      remaining: 0,
      canRetryFailed: false,
      failedItemsCount: 0,
      currentLabel: '',
      lastError: ''
    };
  }

  const runtime = {
    GLOBAL_KEY,
    INJECTED_FLAG: 'ppdInjectedV4',
    DEFAULT_SETTINGS,
    PAGE_STYLE_ID: 'ppd-page-style',
    SHADOW_HOST_ID: 'ppd-shadow-host',
    CLASS_CARD: 'ppd-card',
    CLASS_RELATIVE: 'ppd-card-relative',
    CLASS_ACTIVE: 'ppd-card-active',
    CLASS_SELECTED: 'ppd-card-selected',
    CLASS_MAIN: 'ppd-card-main',
    TOGGLE_ATTR: 'data-ppd-toggle',
    ACTION_ATTR: 'data-action',
    MODE_ATTR: 'data-mode',
    SELECTION_LIMIT: 120,
    modules: Object.create(null),
    initialized: false,
    initializing: false,
    initializationPromise: null,
    state: {
      isActive: false,
      panelOpen: false,
      settings: { ...DEFAULT_SETTINGS },
      selectionMode: 'cumulative',
      visibleItems: [],
      visibleItemMap: new Map(),
      visibleAnchorMap: new Map(),
      selectedMap: new Map(),
      selectedOrder: [],
      scanSourceCache: createScanSourceCache(),
      downloadState: createDownloadState(),
      observer: null,
      rescanTimer: 0,
      rescanDueAt: 0,
      scrollTimer: 0,
      isRefreshing: false,
      needsRescan: false,
      lastUrl: location.href,
      lastScope: '',
      lastScanAt: 0
    },
    ui: {
      host: null,
      shadow: null,
      launcher: null,
      miniBar: null,
      miniCount: null,
      panel: null,
      status: null,
      detectedValue: null,
      selectedValue: null,
      mainValue: null,
      modeCumulative: null,
      modeVisible: null,
      queueText: null,
      queueStats: null,
      queueProgress: null,
      selectedList: null,
      selectedEmpty: null,
      retryButton: null,
      downloadButton: null,
      toastStack: null,
      selectedItemNodes: new Map()
    }
  };

  runtime.createDownloadState = createDownloadState;
  runtime.createScanSourceCache = createScanSourceCache;
  runtime.getSettings = getSettings;
  runtime.normalizeSettings = normalizeSettings;
  runtime.getSnapshot = getSnapshot;
  runtime.resetDownloadState = resetDownloadState;
  runtime.setStatus = setStatus;
  runtime.showToast = showToast;
  runtime.getSelectionOrderMap = getSelectionOrderMap;
  runtime.getVisibleItemBySelectionKey = getVisibleItemBySelectionKey;
  runtime.getVisibleItemByAnchor = getVisibleItemByAnchor;
  runtime.getAnchorForItem = getAnchorForItem;
  runtime.choosePreferredUrl = choosePreferredUrl;
  runtime.scorePinimgUrl = scorePinimgUrl;
  runtime.getSelectionScope = getSelectionScope;
  runtime.getSelectionKey = getSelectionKey;
  runtime.getFallbackLabel = getFallbackLabel;
  runtime.shouldIgnoreShortcut = shouldIgnoreShortcut;
  runtime.absolutizePinterestUrl = absolutizePinterestUrl;
  runtime.normalizeUrl = normalizeUrl;
  runtime.getPinKey = getPinKey;
  runtime.isInternalMutation = isInternalMutation;
  runtime.isInternalNode = isInternalNode;
  runtime.isRectVisible = isRectVisible;
  runtime.getOverlapArea = getOverlapArea;
  runtime.escapeHtml = escapeHtml;
  runtime.escapeAttribute = escapeAttribute;
  runtime.hashString = hashString;
  runtime.markInitialized = markInitialized;

  globalThis[GLOBAL_KEY] = runtime;

  async function getSettings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      return normalizeSettings(response?.settings);
    } catch (error) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function normalizeSettings(settings) {
    return {
      filenamePrefix:
        String(settings?.filenamePrefix || DEFAULT_SETTINGS.filenamePrefix).trim() || DEFAULT_SETTINGS.filenamePrefix
    };
  }

  function getSnapshot() {
    const { state } = runtime;
    return {
      ok: true,
      isActive: state.isActive,
      selectionMode: state.selectionMode,
      selectedCount: state.selectedOrder.length,
      detectedCount: state.visibleItems.length,
      mainFound: state.visibleItems.some((item) => item.role === 'main'),
      settings: state.settings,
      downloadState: state.downloadState,
      url: location.href,
      lastScanAt: state.lastScanAt
    };
  }

  function resetDownloadState() {
    runtime.state.downloadState = createDownloadState();
  }

  function setStatus(message, isError) {
    runtime.ui.status.textContent = message;
    runtime.ui.status.classList.toggle('error', Boolean(isError));
  }

  function showToast(message, tone, duration) {
    const toast = document.createElement('div');
    toast.className = `toast${tone ? ` ${tone}` : ''}`;
    toast.textContent = message;
    runtime.ui.toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, duration || 1600);
  }

  function getSelectionOrderMap() {
    return new Map(runtime.state.selectedOrder.map((selectionKey, index) => [selectionKey, index + 1]));
  }

  function getVisibleItemBySelectionKey(selectionKey) {
    return runtime.state.visibleItemMap.get(selectionKey) || null;
  }

  function getVisibleItemByAnchor(anchor) {
    if (!(anchor instanceof HTMLAnchorElement)) {
      return null;
    }

    return (
      runtime.state.visibleAnchorMap.get(anchor) ||
      runtime.state.visibleItems.find((item) => {
        const itemAnchor = getAnchorForItem(item);
        return itemAnchor === anchor;
      }) ||
      null
    );
  }

  function getAnchorForItem(item) {
    if (item?.anchor instanceof HTMLAnchorElement && item.anchor.isConnected) {
      return item.anchor;
    }

    if (item?.container instanceof HTMLElement) {
      const nestedAnchor = item.container.closest('a[href*="/pin/"]') || item.container.querySelector('a[href*="/pin/"]');
      return nestedAnchor instanceof HTMLAnchorElement ? nestedAnchor : null;
    }

    return null;
  }

  function choosePreferredUrl(previousUrl, nextUrl) {
    const previousScore = scorePinimgUrl(previousUrl);
    const nextScore = scorePinimgUrl(nextUrl);
    return nextScore >= previousScore ? nextUrl : previousUrl;
  }

  function scorePinimgUrl(rawUrl) {
    try {
      const pathSegments = new URL(rawUrl).pathname.split('/').filter(Boolean);
      const sizeSegment = pathSegments[0] || '';
      if (sizeSegment === 'originals') {
        return 500000;
      }

      const widthMatch = sizeSegment.match(/^(\d+)x/i);
      if (widthMatch) {
        return Number(widthMatch[1]) * 100;
      }

      return 0;
    } catch (error) {
      return 0;
    }
  }

  function getSelectionScope() {
    return getPinKey(location.href) || location.pathname || location.href;
  }

  function getSelectionKey(pinUrl, imageUrl) {
    const pinKey = getPinKey(pinUrl);
    return pinKey ? `pin:${pinKey}` : `img:${normalizeUrl(imageUrl)}`;
  }

  function getFallbackLabel(item) {
    return item.label || item.pinKey || 'Pinterest image';
  }

  function shouldIgnoreShortcut(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
      return true;
    }

    const target = event.target instanceof HTMLElement ? event.target : null;
    return Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
  }

  function absolutizePinterestUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl, location.origin);
      if (!/pinterest\.com$/i.test(parsed.hostname)) {
        return '';
      }

      parsed.hash = '';
      return parsed.toString();
    } catch (error) {
      return '';
    }
  }

  function normalizeUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl, location.href);
      parsed.hash = '';
      return parsed.toString();
    } catch (error) {
      return '';
    }
  }

  function getPinKey(rawUrl) {
    try {
      const parsed = new URL(rawUrl || '', location.origin);
      const match = parsed.pathname.match(/\/pin\/[^/?#]+/i);
      return match ? match[0].replace(/\/$/, '') : '';
    } catch (error) {
      return '';
    }
  }

  function isInternalMutation(mutation) {
    if (mutation.type === 'attributes') {
      return isInternalNode(mutation.target);
    }

    const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
    return nodes.length > 0 && nodes.every(isInternalNode);
  }

  function isInternalNode(node) {
    return node instanceof HTMLElement && (node.hasAttribute(runtime.TOGGLE_ATTR) || runtime.ui.host?.contains(node));
  }

  function isRectVisible(rect) {
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  function getOverlapArea(leftRect, rightRect) {
    const width = Math.max(0, Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left));
    const height = Math.max(0, Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top));
    return width * height;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }

  function hashString(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(index);
      hash |= 0;
    }

    return Math.abs(hash).toString(36);
  }

  function markInitialized() {
    runtime.initialized = true;
    document.documentElement.dataset[runtime.INJECTED_FLAG] = 'true';
  }
})();
