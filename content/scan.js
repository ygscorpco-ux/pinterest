(function registerPpdScanModule() {
  const runtime = globalThis.__PPD_CONTENT_RUNTIME__;
  if (!runtime || runtime.initialized || runtime.modules.scan) {
    return;
  }

  runtime.modules.scan = true;

  const {
    state,
    ui,
    SHADOW_HOST_ID,
    CLASS_CARD,
    CLASS_RELATIVE,
    CLASS_ACTIVE,
    CLASS_SELECTED,
    CLASS_MAIN,
    TOGGLE_ATTR,
    SELECTION_LIMIT
  } = runtime;

  runtime.refreshScan = refreshScan;
  runtime.startObserver = startObserver;
  runtime.stopObserver = stopObserver;
  runtime.scheduleRescan = scheduleRescan;
  runtime.syncVisibleState = syncVisibleState;
  runtime.replaceVisibleItems = replaceVisibleItems;
  runtime.collectCandidates = collectCandidates;
  runtime.collectAnchorFallbackCandidates = collectAnchorFallbackCandidates;
  runtime.buildFallbackCandidateFromAnchor = buildFallbackCandidateFromAnchor;
  runtime.findBestMediaForAnchor = findBestMediaForAnchor;
  runtime.pickMainCandidate = pickMainCandidate;
  runtime.pickSimilarCandidates = pickSimilarCandidates;
  runtime.buildVisibleItem = buildVisibleItem;
  runtime.buildVisibleItemFromAnchor = buildVisibleItemFromAnchor;
  runtime.applyDecorations = applyDecorations;
  runtime.decorateItem = decorateItem;
  runtime.clearDecorations = clearDecorations;
  runtime.reuseDecorations = reuseDecorations;
  runtime.updateDecorationState = updateDecorationState;
  runtime.renderBadgeContent = renderBadgeContent;
  runtime.getBestSource = getBestSource;
  runtime.extractBackgroundImageUrl = extractBackgroundImageUrl;
  runtime.getSelectableContainer = getSelectableContainer;
  runtime.getPreferredCardContainer = getPreferredCardContainer;
  runtime.getPreferredCardContainerFromAnchor = getPreferredCardContainerFromAnchor;
  runtime.getPinUrlForImage = getPinUrlForImage;
  runtime.dedupeCandidates = dedupeCandidates;
  runtime.getCandidateLabel = getCandidateLabel;
  runtime.elevateUtilityNodes = elevateUtilityNodes;
  runtime.restoreElevatedNodes = restoreElevatedNodes;
  runtime.chooseBadgePlacement = chooseBadgePlacement;

  async function refreshScan(options) {
    if (state.isRefreshing) {
      state.needsRescan = true;
      return;
    }

    state.isRefreshing = true;

    try {
      const scope = runtime.getSelectionScope();
      if (state.lastScope && state.lastScope !== scope) {
        runtime.clearSelection(true);
        runtime.resetDownloadState();
        state.lastScope = scope;
      } else if (!state.lastScope) {
        state.lastScope = scope;
      }

      const candidates = collectCandidates();
      const mainCandidate = pickMainCandidate(candidates);
      const similarCandidates = pickSimilarCandidates(candidates, mainCandidate);
      const nextItems = [];

      if (mainCandidate) {
        nextItems.push(buildVisibleItem(mainCandidate, 'main', 0));
      }

      similarCandidates.forEach((candidate, index) => {
        nextItems.push(buildVisibleItem(candidate, 'similar', index + 1));
      });

      replaceVisibleItems(nextItems);

      if (state.selectionMode === 'visible') {
        runtime.pruneSelectionToVisible(nextItems);
      }

      runtime.reconcileSelections(nextItems);

      if (options?.autoSelectMain && nextItems[0]?.role === 'main' && state.selectedOrder.length === 0) {
        runtime.addSelection(nextItems[0], false);
      }

      applyDecorations();
      runtime.renderAll();
    } finally {
      state.isRefreshing = false;
      if (state.needsRescan) {
        state.needsRescan = false;
        scheduleRescan(60);
      }
    }
  }

  function startObserver() {
    if (state.observer) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      if (!state.isActive) {
        return;
      }

      if (mutations.every(runtime.isInternalMutation)) {
        return;
      }

      if (location.href !== state.lastUrl) {
        scheduleRescan(120);
        return;
      }

      scheduleRescan(mutations.length > 24 ? 260 : 220);
    });

    state.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'href']
    });
  }

  function stopObserver() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    clearTimeout(state.rescanTimer);
    clearTimeout(state.scrollTimer);
  }

  function scheduleRescan(delay) {
    clearTimeout(state.rescanTimer);
    const elapsed = Date.now() - state.lastScanAt;
    const wait = Math.max(delay, elapsed < 220 ? 220 - elapsed : 0);
    state.rescanTimer = window.setTimeout(() => {
      refreshScan({ autoSelectMain: false }).catch((error) => {
        console.error('[PPD] Failed to rescan images.', error);
      });
    }, wait);
  }

  function syncVisibleState(items) {
    state.visibleItems = items;
    state.visibleItemMap = new Map(items.map((item) => [item.selectionKey, item]));
    state.visibleAnchorMap = new Map();

    for (const item of items) {
      const anchor = runtime.getAnchorForItem(item);
      if (anchor) {
        state.visibleAnchorMap.set(anchor, item);
      }
    }
  }

  function replaceVisibleItems(nextItems) {
    const previousItems = state.visibleItems;
    reuseDecorations(previousItems, nextItems);

    const reusedBadges = new Set(nextItems.map((item) => item.badge).filter(Boolean));
    clearDecorations(previousItems.filter((item) => item.badge && !reusedBadges.has(item.badge)));

    syncVisibleState(nextItems);
    state.lastScanAt = Date.now();
    state.lastUrl = location.href;
  }

  function collectCandidates() {
    const candidates = [];
    const seenSelectionKeys = new Set();

    for (const image of Array.from(document.images)) {
      if (!(image instanceof HTMLImageElement)) {
        continue;
      }

      if (!image.isConnected || image.closest(`#${SHADOW_HOST_ID}`)) {
        continue;
      }

      const imageRect = image.getBoundingClientRect();
      const imageArea = imageRect.width * imageRect.height;
      if (
        !runtime.isRectVisible(imageRect) ||
        Math.max(imageRect.width, imageRect.height) < 96 ||
        Math.min(imageRect.width, imageRect.height) < 56 ||
        imageArea < 8000
      ) {
        continue;
      }

      if (
        Math.max(image.naturalWidth, image.naturalHeight) < 140 ||
        image.naturalWidth * image.naturalHeight < 14000
      ) {
        continue;
      }

      const imageUrl = getBestSource(image);
      if (!imageUrl) {
        continue;
      }

      const container = getSelectableContainer(image);
      if (!(container instanceof HTMLElement)) {
        continue;
      }

      const containerRect = container.getBoundingClientRect();
      if (
        !runtime.isRectVisible(containerRect) ||
        Math.max(containerRect.width, containerRect.height) < 96 ||
        Math.min(containerRect.width, containerRect.height) < 56
      ) {
        continue;
      }

      const pinUrl = getPinUrlForImage(image, imageRect);
      const normalizedImageUrl = runtime.normalizeUrl(imageUrl);
      if (!normalizedImageUrl) {
        continue;
      }

      const pinKey = runtime.getPinKey(pinUrl);
      const selectionKey = runtime.getSelectionKey(pinUrl, normalizedImageUrl);
      seenSelectionKeys.add(selectionKey);
      candidates.push({
        anchor: image.closest('a[href*="/pin/"]'),
        image,
        container,
        imageRect,
        containerRect,
        imageArea,
        containerArea: containerRect.width * containerRect.height,
        imageUrl: normalizedImageUrl,
        thumbnailUrl: runtime.normalizeUrl(image.currentSrc || image.src || normalizedImageUrl),
        pinUrl,
        pinKey,
        selectionKey,
        label: getCandidateLabel(image, container, pinKey)
      });
    }

    candidates.push(...collectAnchorFallbackCandidates(seenSelectionKeys));

    return dedupeCandidates(candidates);
  }

  function collectAnchorFallbackCandidates(seenSelectionKeys) {
    const candidates = [];

    for (const anchor of Array.from(document.querySelectorAll('a[href*="/pin/"]'))) {
      const candidate = buildFallbackCandidateFromAnchor(anchor, seenSelectionKeys);
      if (!candidate) {
        continue;
      }

      seenSelectionKeys?.add(candidate.selectionKey);
      candidates.push(candidate);
    }

    return candidates;
  }

  function buildFallbackCandidateFromAnchor(anchor, seenSelectionKeys) {
    if (!(anchor instanceof HTMLAnchorElement) || !anchor.isConnected || anchor.closest(`#${SHADOW_HOST_ID}`)) {
      return null;
    }

    const pinUrl = runtime.absolutizePinterestUrl(anchor.getAttribute('href'));
    if (!pinUrl) {
      return null;
    }

    const media = findBestMediaForAnchor(anchor);
    if (!media?.url) {
      return null;
    }

    const normalizedImageUrl = runtime.normalizeUrl(media.url);
    if (!normalizedImageUrl) {
      return null;
    }

    const selectionKey = runtime.getSelectionKey(pinUrl, normalizedImageUrl);
    if (seenSelectionKeys?.has(selectionKey)) {
      return null;
    }

    const imageRect = media.rect;
    const imageArea = imageRect.width * imageRect.height;
    if (
      !runtime.isRectVisible(imageRect) ||
      Math.max(imageRect.width, imageRect.height) < 96 ||
      Math.min(imageRect.width, imageRect.height) < 52 ||
      imageArea < 6800
    ) {
      return null;
    }

    const container = getPreferredCardContainerFromAnchor(anchor, imageRect) || anchor;
    if (!(container instanceof HTMLElement)) {
      return null;
    }

    const containerRect = container.getBoundingClientRect();
    if (
      !runtime.isRectVisible(containerRect) ||
      Math.max(containerRect.width, containerRect.height) < 96 ||
      Math.min(containerRect.width, containerRect.height) < 52
    ) {
      return null;
    }

    const pinKey = runtime.getPinKey(pinUrl);
    return {
      anchor,
      image: media.element,
      container,
      imageRect,
      containerRect,
      imageArea,
      containerArea: containerRect.width * containerRect.height,
      imageUrl: normalizedImageUrl,
      thumbnailUrl: runtime.normalizeUrl(media.thumbnailUrl || normalizedImageUrl),
      pinUrl,
      pinKey,
      selectionKey,
      label: getCandidateLabel(media.element || anchor, container, pinKey)
    };
  }

  function findBestMediaForAnchor(anchor) {
    let best = null;
    let bestScore = -Infinity;

    for (const image of Array.from(anchor.querySelectorAll('img'))) {
      if (!(image instanceof HTMLImageElement) || !image.isConnected) {
        continue;
      }

      const rect = image.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (!runtime.isRectVisible(rect) || area < 3200 || Math.min(rect.width, rect.height) < 28) {
        continue;
      }

      const imageUrl = getBestSource(image) || image.currentSrc || image.src;
      if (!imageUrl) {
        continue;
      }

      const naturalArea = Math.max(1, image.naturalWidth || 0) * Math.max(1, image.naturalHeight || 0);
      const score = area * 1.25 + naturalArea * 0.02;
      if (score > bestScore) {
        best = {
          element: image,
          rect,
          url: imageUrl,
          thumbnailUrl: image.currentSrc || image.src || imageUrl
        };
        bestScore = score;
      }
    }

    if (best) {
      return best;
    }

    const backgroundNodes = [anchor, ...Array.from(anchor.querySelectorAll('*')).slice(0, 18)];
    for (const node of backgroundNodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      const backgroundUrl = extractBackgroundImageUrl(node);
      if (!backgroundUrl) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (!runtime.isRectVisible(rect) || area < 4800 || Math.min(rect.width, rect.height) < 40) {
        continue;
      }

      return {
        element: node,
        rect,
        url: backgroundUrl,
        thumbnailUrl: backgroundUrl
      };
    }

    return null;
  }

  function pickMainCandidate(candidates) {
    if (!candidates.length) {
      return null;
    }

    const currentPinKey = runtime.getPinKey(location.href);
    const scoped = candidates.filter((candidate) => candidate.pinKey && candidate.pinKey === currentPinKey);
    const pool =
      scoped.length > 0
        ? scoped
        : candidates.filter((candidate) => candidate.imageRect.left < window.innerWidth * 0.62);

    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const candidate of pool) {
      const centerX = candidate.imageRect.left + candidate.imageRect.width / 2;
      const targetX = window.innerWidth * 0.34;
      const horizontalPenalty = Math.abs(centerX - targetX) * 38;
      const topPenalty = Math.max(0, candidate.imageRect.top) * 20;
      const leftBonus = candidate.imageRect.left < window.innerWidth * 0.55 ? 64000 : 0;
      const pinBonus = candidate.pinKey && candidate.pinKey === currentPinKey ? 500000 : 0;
      const score =
        candidate.imageArea * 1.35 +
        candidate.containerArea * 0.18 +
        leftBonus +
        pinBonus -
        horizontalPenalty -
        topPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  function pickSimilarCandidates(candidates, mainCandidate) {
    const currentPinKey = runtime.getPinKey(location.href);
    const mainRect = mainCandidate?.imageRect || null;
    const seen = new Set();
    const result = [];

    for (const candidate of candidates) {
      if (mainCandidate && candidate.selectionKey === mainCandidate.selectionKey) {
        continue;
      }

      if (candidate.pinKey && candidate.pinKey === currentPinKey) {
        continue;
      }

      if (seen.has(candidate.selectionKey)) {
        continue;
      }

      if (mainRect) {
        const overlap = runtime.getOverlapArea(
          {
            left: candidate.imageRect.left,
            top: candidate.imageRect.top,
            right: candidate.imageRect.right,
            bottom: candidate.imageRect.bottom
          },
          {
            left: mainRect.left,
            top: mainRect.top,
            right: mainRect.right,
            bottom: mainRect.bottom
          }
        );
        const overlapRatio = overlap / Math.max(1, candidate.imageArea);
        if (overlapRatio > 0.22) {
          continue;
        }
      }

      seen.add(candidate.selectionKey);
      result.push(candidate);
    }

    return result
      .sort((left, right) => {
        if (left.imageRect.top === right.imageRect.top) {
          return left.imageRect.left - right.imageRect.left;
        }

        return left.imageRect.top - right.imageRect.top;
      })
      .slice(0, SELECTION_LIMIT);
  }

  function buildVisibleItem(candidate, role, index) {
    return {
      id: `${role}-${runtime.hashString(`${candidate.selectionKey}-${index}`)}`,
      selectionKey: candidate.selectionKey,
      pinKey: candidate.pinKey,
      pinUrl: role === 'main' ? location.href : candidate.pinUrl,
      imageUrl: candidate.imageUrl,
      thumbnailUrl: candidate.thumbnailUrl || candidate.imageUrl,
      label: candidate.label,
      role,
      anchor: candidate.anchor || null,
      container: candidate.container,
      badge: null,
      hitArea: null,
      onCardClick: null,
      elevatedNodes: []
    };
  }

  function buildVisibleItemFromAnchor(anchor) {
    const candidate = buildFallbackCandidateFromAnchor(anchor);
    if (!candidate) {
      return null;
    }

    const currentPinKey = runtime.getPinKey(location.href);
    const hasMain = state.visibleItems.some((item) => item.role === 'main');
    const role = !hasMain && candidate.pinKey && candidate.pinKey === currentPinKey ? 'main' : 'similar';
    return buildVisibleItem(candidate, role, state.visibleItems.length + 1);
  }

  function applyDecorations() {
    for (const item of state.visibleItems) {
      if (!item.badge || !item.hitArea || !item.onCardClick) {
        decorateItem(item);
      }
    }

    updateDecorationState();
  }

  function decorateItem(item) {
    const container = item.container;
    if (!(container instanceof HTMLElement) || !container.isConnected) {
      return;
    }

    container.classList.add(CLASS_CARD, CLASS_ACTIVE);
    if (getComputedStyle(container).position === 'static') {
      container.classList.add(CLASS_RELATIVE);
    }

    const badge = document.createElement('div');
    badge.className = 'ppd-badge';
    badge.setAttribute('role', 'button');
    badge.tabIndex = 0;
    badge.setAttribute(TOGGLE_ATTR, 'true');
    badge.dataset.id = item.id;
    badge.dataset.role = item.role;
    badge.dataset.placement = chooseBadgePlacement(container);
    const onBadgeToggle = (event) => {
      if (!state.isActive) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      runtime.toggleSelection(item.selectionKey, true);
    };
    badge.addEventListener('click', (event) => {
      onBadgeToggle(event);
    });
    badge.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      onBadgeToggle(event);
    });

    const hitArea = document.createElement('div');
    hitArea.className = 'ppd-hit-area';
    hitArea.setAttribute(TOGGLE_ATTR, 'true');
    hitArea.dataset.id = item.id;
    hitArea.dataset.role = item.role;
    hitArea.setAttribute('aria-hidden', 'true');

    const onCardClick = (event) => {
      if (!state.isActive) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      runtime.toggleSelection(item.selectionKey, false);
    };

    hitArea.addEventListener('click', onCardClick);
    item.elevatedNodes = elevateUtilityNodes(container);
    container.appendChild(hitArea);
    container.appendChild(badge);
    item.badge = badge;
    item.hitArea = hitArea;
    item.onCardClick = onCardClick;
  }

  function clearDecorations(items) {
    const targetItems = Array.isArray(items) ? items : state.visibleItems;
    for (const item of targetItems) {
      if (item.badge?.isConnected) {
        item.badge.remove();
      }

      if (item.hitArea?.isConnected) {
        item.hitArea.remove();
      }

      restoreElevatedNodes(item.elevatedNodes);

      if (item.container instanceof HTMLElement) {
        item.container.classList.remove(CLASS_CARD, CLASS_RELATIVE, CLASS_ACTIVE, CLASS_SELECTED, CLASS_MAIN);
      }

      item.badge = null;
      item.hitArea = null;
      item.onCardClick = null;
      item.elevatedNodes = [];
    }
  }

  function reuseDecorations(previousItems, nextItems) {
    const previousByKey = new Map(previousItems.map((item) => [item.selectionKey, item]));

    for (const item of nextItems) {
      const previous = previousByKey.get(item.selectionKey);
      if (!previous || previous.container !== item.container) {
        continue;
      }

      if (!(previous.badge instanceof HTMLElement) || !(previous.hitArea instanceof HTMLElement) || typeof previous.onCardClick !== 'function') {
        continue;
      }

      item.badge = previous.badge;
      item.hitArea = previous.hitArea;
      item.onCardClick = previous.onCardClick;
      item.elevatedNodes = previous.elevatedNodes;
      item.badge.dataset.id = item.id;
      item.badge.dataset.role = item.role;
      item.badge.dataset.placement = chooseBadgePlacement(item.container);
      item.hitArea.dataset.id = item.id;
      item.hitArea.dataset.role = item.role;
    }
  }

  function updateDecorationState() {
    const orderMap = runtime.getSelectionOrderMap();

    for (const item of state.visibleItems) {
      const container = item.container;
      const badge = item.badge;
      const hitArea = item.hitArea;
      if (
        !(container instanceof HTMLElement) ||
        !(badge instanceof HTMLElement) ||
        !(hitArea instanceof HTMLElement) ||
        !container.isConnected
      ) {
        continue;
      }

      const isSelected = state.selectedMap.has(item.selectionKey);
      const order = orderMap.get(item.selectionKey) || 0;
      container.classList.toggle(CLASS_SELECTED, isSelected);
      container.classList.toggle(CLASS_MAIN, item.role === 'main');
      badge.dataset.selected = isSelected ? 'true' : 'false';
      badge.dataset.role = item.role;
      hitArea.dataset.selected = isSelected ? 'true' : 'false';
      badge.setAttribute('aria-label', isSelected ? `${order}번 선택됨` : item.role === 'main' ? '메인 이미지 선택' : '이미지 선택');
      renderBadgeContent(badge, item, isSelected, order);
    }
  }

  function renderBadgeContent(badge, item, isSelected, order) {
    if (!isSelected) {
      const idleText = item.role === 'main' ? 'M' : '+';
      const idleLabel = item.role === 'main' ? 'MAIN' : 'SELECT';
      badge.innerHTML = `<span class="ppd-badge__check">${runtime.escapeHtml(idleText)}</span><span class="ppd-badge__label">${runtime.escapeHtml(idleLabel)}</span>`;
      return;
    }

    const mark = item.role === 'main' ? 'M' : '✓';
    badge.innerHTML = `<span class="ppd-badge__check">${runtime.escapeHtml(mark)}</span><span class="ppd-badge__label">${order}</span>`;
  }

  function getBestSource(image) {
    const srcset = image.getAttribute('srcset');
    if (srcset) {
      const candidates = srcset
        .split(',')
        .map((part) => part.trim())
        .map((part) => {
          const [url, descriptor] = part.split(/\s+/);
          const width = Number((descriptor || '').replace('w', ''));
          return { url, width: Number.isFinite(width) ? width : 0 };
        })
        .filter((candidate) => candidate.url);

      if (candidates.length) {
        candidates.sort((left, right) => right.width - left.width);
        return candidates[0].url;
      }
    }

    return image.currentSrc || image.src || '';
  }

  function extractBackgroundImageUrl(element) {
    if (!(element instanceof HTMLElement)) {
      return '';
    }

    const backgroundImage = getComputedStyle(element).backgroundImage || '';
    const match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/i);
    return match?.[2] ? match[2] : '';
  }

  function getSelectableContainer(image) {
    const imageRect = image.getBoundingClientRect();
    const preferredCardContainer = getPreferredCardContainer(image, imageRect);
    if (preferredCardContainer) {
      return preferredCardContainer;
    }

    let bestContainer = image.parentElement;
    let bestScore = -Infinity;
    let node = image.parentElement;

    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement || node === ui.host) {
        break;
      }

      const rect = node.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) {
        continue;
      }

      const areaRatio = (rect.width * rect.height) / Math.max(1, imageRect.width * imageRect.height);
      const widthPenalty = Math.abs(rect.width - imageRect.width) * 2;
      const heightPenalty = Math.abs(rect.height - imageRect.height) * 2;
      const offsetPenalty = Math.abs(rect.left - imageRect.left) * 3 + Math.abs(rect.top - imageRect.top) * 3;
      const areaPenalty = Math.abs(areaRatio - 1) * 180;
      const anchorBonus = node.matches('a[href*="/pin/"]') ? 24 : 0;
      const roundedBonus = parseFloat(getComputedStyle(node).borderRadius || '0') > 0 ? 12 : 0;
      const score = 1000 + anchorBonus + roundedBonus - widthPenalty - heightPenalty - offsetPenalty - areaPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestContainer = node;
      }

      if (rect.width > imageRect.width * 1.85 || rect.height > imageRect.height * 1.95) {
        break;
      }
    }

    return bestContainer || image.parentElement;
  }

  function getPreferredCardContainer(image, imageRect) {
    const pinAnchor = image.closest('a[href*="/pin/"]');
    if (!(pinAnchor instanceof HTMLElement)) {
      return null;
    }

    return getPreferredCardContainerFromAnchor(pinAnchor, imageRect);
  }

  function getPreferredCardContainerFromAnchor(pinAnchor, imageRect) {
    let best = null;
    let bestArea = 0;
    let node = pinAnchor;

    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement) || node === document.body || node === document.documentElement || node === ui.host) {
        break;
      }

      const rect = node.getBoundingClientRect();
      if (!runtime.isRectVisible(rect)) {
        continue;
      }

      const widthRatio = rect.width / Math.max(1, imageRect.width);
      const heightRatio = rect.height / Math.max(1, imageRect.height);
      if (widthRatio < 0.92 || heightRatio < 0.92) {
        continue;
      }

      if (widthRatio > 3.4 || heightRatio > 4.6) {
        break;
      }

      const area = rect.width * rect.height;
      if (area > bestArea) {
        best = node;
        bestArea = area;
      }
    }

    return best;
  }

  function getPinUrlForImage(image, imageRect) {
    const directLink = image.closest('a[href*="/pin/"]');
    if (directLink) {
      return runtime.absolutizePinterestUrl(directLink.getAttribute('href'));
    }

    let node = image.parentElement;
    for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }

      const nestedLink = node.querySelector('a[href*="/pin/"]');
      if (nestedLink) {
        return runtime.absolutizePinterestUrl(nestedLink.getAttribute('href'));
      }
    }

    if (/\/pin\//i.test(location.pathname) && imageRect.left < window.innerWidth * 0.55 && imageRect.width > 220) {
      return location.href;
    }

    return '';
  }

  function dedupeCandidates(candidates) {
    const map = new Map();
    for (const candidate of candidates) {
      const existing = map.get(candidate.selectionKey);
      if (!existing || candidate.imageArea > existing.imageArea) {
        map.set(candidate.selectionKey, candidate);
      }
    }

    return Array.from(map.values());
  }

  function getCandidateLabel(image, container, pinKey) {
    const imageAlt = String(image.alt || '').trim();
    if (imageAlt) {
      return imageAlt;
    }

    const ariaLabel = String(container.getAttribute('aria-label') || '').trim();
    if (ariaLabel) {
      return ariaLabel;
    }

    const text = String(container.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) {
      return text.slice(0, 60);
    }

    return pinKey || 'Pinterest image';
  }

  function elevateUtilityNodes(container) {
    const containerRect = container.getBoundingClientRect();
    const containerArea = Math.max(1, containerRect.width * containerRect.height);
    const elevated = [];
    const nodes = container.querySelectorAll('button, [role="button"], input, textarea, select, summary, details, a[href]');

    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || node.hasAttribute(TOGGLE_ATTR)) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (!runtime.isRectVisible(rect) || area <= 0 || area >= containerArea * 0.42) {
        continue;
      }

      const label = `${node.getAttribute('aria-label') || ''} ${node.textContent || ''}`.toLowerCase();
      const href = node.getAttribute('href') || '';
      const isUtilityLink = node.tagName === 'A' && !/\/pin\//i.test(href);
      const isUtilityAction =
        node.tagName !== 'A' ||
        isUtilityLink ||
        label.includes('save') ||
        label.includes('visit') ||
        label.includes('site') ||
        label.includes('profile') ||
        label.includes('board');

      if (!isUtilityAction) {
        continue;
      }

      elevated.push({
        node,
        position: node.style.position,
        zIndex: node.style.zIndex
      });

      if (getComputedStyle(node).position === 'static') {
        node.style.position = 'relative';
      }

      node.style.zIndex = '2147482950';
    }

    return elevated;
  }

  function restoreElevatedNodes(entries) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!(entry?.node instanceof HTMLElement)) {
        continue;
      }

      entry.node.style.position = entry.position || '';
      entry.node.style.zIndex = entry.zIndex || '';
    }
  }

  function chooseBadgePlacement(container) {
    const containerRect = container.getBoundingClientRect();
    const containerArea = containerRect.width * containerRect.height;
    const placements = ['top-left', 'bottom-left', 'bottom-right', 'top-right'];
    const scores = new Map(placements.map((placement) => [placement, 0]));
    const badgeWidth = 80;
    const badgeHeight = 36;
    const inset = 10;
    const cornerRects = {
      'top-left': { left: inset, top: inset, right: inset + badgeWidth, bottom: inset + badgeHeight },
      'top-right': {
        left: Math.max(inset, containerRect.width - inset - badgeWidth),
        top: inset,
        right: Math.max(inset + badgeWidth, containerRect.width - inset),
        bottom: inset + badgeHeight
      },
      'bottom-left': {
        left: inset,
        top: Math.max(inset, containerRect.height - inset - badgeHeight),
        right: inset + badgeWidth,
        bottom: Math.max(inset + badgeHeight, containerRect.height - inset)
      },
      'bottom-right': {
        left: Math.max(inset, containerRect.width - inset - badgeWidth),
        top: Math.max(inset, containerRect.height - inset - badgeHeight),
        right: Math.max(inset + badgeWidth, containerRect.width - inset),
        bottom: Math.max(inset + badgeHeight, containerRect.height - inset)
      }
    };
    const nodes = container.querySelectorAll('button, [role="button"], a[href], [aria-label], [data-test-id]');

    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || node.hasAttribute(TOGGLE_ATTR)) {
        continue;
      }

      const rect = node.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (!runtime.isRectVisible(rect) || area <= 0 || area > containerArea * 0.35) {
        continue;
      }

      const localRect = {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        right: rect.right - containerRect.left,
        bottom: rect.bottom - containerRect.top
      };
      const label = `${node.getAttribute('aria-label') || ''} ${node.textContent || ''}`.toLowerCase();
      const weight =
        label.includes('save') ||
        label.includes('visit') ||
        label.includes('site') ||
        label.includes('저장') ||
        label.includes('방문')
          ? 2.4
          : 1;

      for (const placement of placements) {
        const overlap = runtime.getOverlapArea(localRect, cornerRects[placement]);
        if (overlap) {
          scores.set(placement, scores.get(placement) + overlap * weight);
        }
      }
    }

    return placements.slice().sort((left, right) => scores.get(left) - scores.get(right))[0];
  }
})();
