const DEFAULT_SETTINGS = {
  filenamePrefix: 'pinterest'
};

const activeJobs = new Map();
const jobHistory = new Map();
const pinPageCandidatesCache = new Map();
const PIN_PAGE_CACHE_LIMIT = 120;

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.storage.local.set({
    ppdSettings: {
      ...DEFAULT_SETTINGS,
      ...settings
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === 'GET_SETTINGS') {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'SAVE_SETTINGS') {
    const nextSettings = normalizeSettings(message.settings);
    chrome.storage.local
      .set({ ppdSettings: nextSettings })
      .then(() => sendResponse({ ok: true, settings: nextSettings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === 'DOWNLOAD_IMAGES') {
    const tabId = sender?.tab?.id ?? message.tabId;
    const items = Array.isArray(message.items) ? message.items : [];
    const settings = normalizeSettings(message.settings);

    if (!tabId || !items.length) {
      sendResponse({ ok: false, error: '다운로드할 이미지가 없습니다.' });
      return false;
    }

    if (activeJobs.has(tabId)) {
      sendResponse({ ok: false, error: '이미 다운로드 작업이 진행 중입니다.' });
      return false;
    }

    activeJobs.set(tabId, true);
    runDownloadJob(tabId, items, settings, { retryFailedOnly: false })
      .catch((error) => {
        notifyTab(tabId, {
          status: 'error',
          message: error.message || '다운로드 작업 중 오류가 발생했습니다.',
          canRetryFailed: getFailedItems(tabId).length > 0,
          failedItemsCount: getFailedItems(tabId).length
        });
      })
      .finally(() => {
        activeJobs.delete(tabId);
      });

    sendResponse({ ok: true, accepted: true, total: items.length });
    return false;
  }

  if (message.type === 'RETRY_FAILED_DOWNLOADS') {
    const tabId = sender?.tab?.id ?? message.tabId;
    const failedItems = getFailedItems(tabId);
    const settings = normalizeSettings(message.settings || jobHistory.get(tabId)?.settings);

    if (!tabId || !failedItems.length) {
      sendResponse({ ok: false, error: '재시도할 실패 항목이 없습니다.' });
      return false;
    }

    if (activeJobs.has(tabId)) {
      sendResponse({ ok: false, error: '이미 다운로드 작업이 진행 중입니다.' });
      return false;
    }

    activeJobs.set(tabId, true);
    runDownloadJob(tabId, failedItems, settings, { retryFailedOnly: true })
      .catch((error) => {
        notifyTab(tabId, {
          status: 'error',
          message: error.message || '실패 항목 재시도 중 오류가 발생했습니다.',
          canRetryFailed: getFailedItems(tabId).length > 0,
          failedItemsCount: getFailedItems(tabId).length
        });
      })
      .finally(() => {
        activeJobs.delete(tabId);
      });

    sendResponse({ ok: true, accepted: true, total: failedItems.length });
    return false;
  }

  return false;
});

async function getSettings() {
  const result = await chrome.storage.local.get('ppdSettings');
  return normalizeSettings(result.ppdSettings);
}

function normalizeSettings(settings) {
  return {
    filenamePrefix: sanitizeSegment(settings?.filenamePrefix || DEFAULT_SETTINGS.filenamePrefix, 'pinterest')
  };
}

async function runDownloadJob(tabId, rawItems, settings, options) {
  const items = dedupeItems(rawItems);
  if (!items.length) {
    throw new Error('다운로드할 이미지가 없습니다.');
  }

  notifyTab(tabId, {
    status: 'running',
    message: options.retryFailedOnly ? `실패 항목 재시도 시작 (${items.length}개)` : `PNG 다운로드 시작 (${items.length}개)`,
    processed: 0,
    total: items.length,
    failed: 0,
    remaining: items.length,
    canRetryFailed: false,
    failedItemsCount: 0
  });

  let processed = 0;
  let failed = 0;
  const failedItems = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    notifyTab(tabId, {
      status: 'running',
      message: `${index + 1}/${items.length} 처리 중`,
      processed,
      total: items.length,
      failed,
      remaining: Math.max(0, items.length - processed - failed),
      currentLabel: item.role === 'main' ? '메인 이미지' : '유사 이미지',
      canRetryFailed: false,
      failedItemsCount: failedItems.length
    });

    try {
      const { blob } = await fetchBestImageBlob(item);
      const pngBlob = await ensurePngBlob(blob);
      const filename = buildFilename(item, index, settings);
      await downloadBlob(pngBlob, filename);

      processed += 1;
      notifyTab(tabId, {
        status: 'running',
        message: `${processed}/${items.length} 저장 완료`,
        processed,
        total: items.length,
        failed,
        remaining: Math.max(0, items.length - processed - failed),
        canRetryFailed: false,
        failedItemsCount: failedItems.length
      });
    } catch (error) {
      failed += 1;
      failedItems.push(item);
      notifyTab(tabId, {
        status: 'running',
        message: `${index + 1}/${items.length} 항목 저장 실패`,
        processed,
        total: items.length,
        failed,
        remaining: Math.max(0, items.length - processed - failed),
        lastError: error.message || '이미지 저장 실패',
        canRetryFailed: false,
        failedItemsCount: failedItems.length
      });
    }
  }

  jobHistory.set(tabId, {
    failedItems,
    settings
  });

  notifyTab(tabId, {
    status: 'completed',
    message:
      failedItems.length > 0
        ? `완료: 성공 ${processed}개, 실패 ${failedItems.length}개`
        : `완료: ${processed}개 저장됨`,
    processed,
    total: items.length,
    failed,
    remaining: 0,
    canRetryFailed: failedItems.length > 0,
    failedItemsCount: failedItems.length
  });
}

async function fetchBestImageBlob(item) {
  const candidateUrls = await buildCandidateUrls(item);
  let lastError = null;

  for (const candidateUrl of candidateUrls) {
    try {
      const blob = await fetchImageBlob(candidateUrl);
      return {
        blob,
        sourceUrl: candidateUrl
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('다운로드 가능한 이미지 URL을 찾지 못했습니다.');
}

async function buildCandidateUrls(item) {
  const urls = [];

  if (item.pinUrl) {
    const pinPageCandidates = await getPinPageCandidateUrls(item.pinUrl, item.imageUrl);
    urls.push(...pinPageCandidates);
  }

  if (item.imageUrl) {
    urls.push(...buildDerivedImageUrls(item.imageUrl));
    urls.push(item.imageUrl);
  }

  return dedupeUrlList(urls);
}

async function getPinPageCandidateUrls(pinUrl, seedImageUrl) {
  const absolutePinUrl = normalizePinUrl(pinUrl);
  if (!absolutePinUrl) {
    return [];
  }

  let cachedValue = pinPageCandidatesCache.get(absolutePinUrl);
  if (!cachedValue) {
    cachedValue = fetchPinPageHtml(absolutePinUrl)
      .then((html) => extractPinImageUrlsFromHtml(html))
      .then((candidates) => {
        pinPageCandidatesCache.delete(absolutePinUrl);
        pinPageCandidatesCache.set(absolutePinUrl, candidates);
        trimPinPageCache();
        return candidates;
      })
      .catch((error) => {
        pinPageCandidatesCache.delete(absolutePinUrl);
        throw error;
      });

    pinPageCandidatesCache.set(absolutePinUrl, cachedValue);
    trimPinPageCache();
  }

  const candidates = await Promise.resolve(cachedValue);
  pinPageCandidatesCache.delete(absolutePinUrl);
  pinPageCandidatesCache.set(absolutePinUrl, candidates);
  trimPinPageCache();

  return rankCandidateUrls(candidates, seedImageUrl);
}

function trimPinPageCache() {
  while (pinPageCandidatesCache.size > PIN_PAGE_CACHE_LIMIT) {
    const oldestKey = pinPageCandidatesCache.keys().next().value;
    if (!oldestKey) {
      break;
    }

    pinPageCandidatesCache.delete(oldestKey);
  }
}

async function fetchPinPageHtml(pinUrl) {
  const response = await fetch(pinUrl, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml'
    }
  });

  if (!response.ok) {
    throw new Error(`핀 상세 요청 실패 (${response.status})`);
  }

  return response.text();
}

function extractPinImageUrlsFromHtml(html) {
  const patterns = [
    /https:\/\/i\.pinimg\.com\/[A-Za-z0-9_./?=&%-]+/g,
    /https:\\\/\\\/i\.pinimg\.com\\\/[A-Za-z0-9_./?=&%-]+/g
  ];
  const urls = [];

  for (const pattern of patterns) {
    const matches = html.match(pattern) || [];
    for (const match of matches) {
      const normalized = normalizeExtractedUrl(match);
      if (normalized) {
        urls.push(normalized);
      }
    }
  }

  return dedupeUrlList(urls);
}

function normalizeExtractedUrl(rawUrl) {
  const decoded = rawUrl.replace(/\\\//g, '/');

  try {
    const parsed = new URL(decoded);
    if (!/pinimg\.com$/i.test(parsed.hostname)) {
      return '';
    }

    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

function rankCandidateUrls(urls, seedImageUrl) {
  const seedAssetKey = getPinimgAssetKey(seedImageUrl);
  const seedBaseName = getPinimgBaseName(seedImageUrl);
  const exactMatches = urls.filter((url) => {
    const candidateAssetKey = getPinimgAssetKey(url);
    const candidateBaseName = getPinimgBaseName(url);
    return (
      (seedAssetKey && candidateAssetKey && seedAssetKey === candidateAssetKey) ||
      (seedBaseName && candidateBaseName && seedBaseName === candidateBaseName)
    );
  });

  const pool = exactMatches.length > 0 ? exactMatches : urls;
  return [...pool].sort((left, right) => scoreCandidateUrl(right, seedImageUrl) - scoreCandidateUrl(left, seedImageUrl));
}

function scoreCandidateUrl(candidateUrl, seedImageUrl) {
  let score = getPinimgSizeScore(candidateUrl);
  const seedAssetKey = getPinimgAssetKey(seedImageUrl);
  const candidateAssetKey = getPinimgAssetKey(candidateUrl);
  const seedBaseName = getPinimgBaseName(seedImageUrl);
  const candidateBaseName = getPinimgBaseName(candidateUrl);

  if (/\/originals\//i.test(candidateUrl)) {
    score += 500000;
  }

  if (seedAssetKey && candidateAssetKey && seedAssetKey === candidateAssetKey) {
    score += 200000;
  }

  if (seedBaseName && candidateBaseName && seedBaseName === candidateBaseName) {
    score += 120000;
  }

  return score;
}

function getPinimgSizeScore(rawUrl) {
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

function getPinimgAssetKey(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!/pinimg\.com$/i.test(parsed.hostname)) {
      return '';
    }

    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const relevant = pathSegments.slice(1);
    if (relevant.length < 4) {
      return '';
    }

    const folders = relevant.slice(0, 3);
    const fileName = relevant[3].replace(/\.[a-z0-9]+$/i, '');
    return [...folders, fileName].join('/');
  } catch (error) {
    return '';
  }
}

function getPinimgBaseName(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    return (pathSegments[pathSegments.length - 1] || '').replace(/\.[a-z0-9]+$/i, '');
  } catch (error) {
    return '';
  }
}

function buildDerivedImageUrls(imageUrl) {
  try {
    const parsed = new URL(imageUrl);
    if (!/pinimg\.com$/i.test(parsed.hostname)) {
      return [];
    }

    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    if (pathSegments.length < 5) {
      return [imageUrl];
    }

    const sizeSegment = pathSegments[0] || '';
    if (sizeSegment === 'originals') {
      return [imageUrl];
    }

    if (!/^(\d+)x/i.test(sizeSegment)) {
      return [imageUrl];
    }

    const assetPath = pathSegments.slice(1).join('/');
    const sizeCandidates = ['originals', '1200x', '736x', '564x', '474x'];
    return sizeCandidates.map((segment) => `${parsed.origin}/${segment}/${assetPath}`);
  } catch (error) {
    return [imageUrl];
  }
}

async function fetchImageBlob(imageUrl) {
  const response = await fetch(imageUrl, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'image/*,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`이미지 요청 실패 (${response.status})`);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('이미지 파일이 아닙니다.');
  }

  return blob;
}

async function ensurePngBlob(blob) {
  if (blob.type === 'image/png') {
    return blob;
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    throw new Error('PNG 변환용 캔버스를 만들지 못했습니다.');
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  return canvas.convertToBlob({
    type: 'image/png'
  });
}

async function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url: objectUrl,
      filename,
      saveAs: false,
      conflictAction: 'uniquify'
    });
  } finally {
    // Delay revocation slightly so the download manager can consume the blob URL.
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 30_000);
  }
}

function buildFilename(item, index, settings) {
  const prefix = sanitizeSegment(settings.filenamePrefix, 'pinterest');
  const role = item.role === 'main' ? 'main' : 'similar';
  const sequence = String(index + 1).padStart(3, '0');
  const pinId = sanitizeSegment(extractPinId(item.pinKey, item.pinUrl), role);
  return `${prefix}/${prefix}-${role}-${sequence}-${pinId}.png`;
}

function dedupeItems(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const normalizedPinUrl = normalizePinUrl(item?.pinUrl);
    const normalizedImageUrl = normalizeUrl(item?.imageUrl);
    if (!normalizedImageUrl && !normalizedPinUrl) {
      continue;
    }

    const key = item?.selectionKey || item?.pinKey || normalizedPinUrl || normalizedImageUrl;
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({
      selectionKey: item.selectionKey || key,
      pinKey: item.pinKey || extractPinId('', normalizedPinUrl),
      imageUrl: normalizedImageUrl,
      pinUrl: normalizedPinUrl,
      role: item.role === 'main' ? 'main' : 'similar'
    });
  }

  return deduped;
}

function dedupeUrlList(urls) {
  const seen = new Set();
  const result = [];

  for (const rawUrl of urls) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function sanitizeSegment(value, fallbackValue) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 60);

  return cleaned || fallbackValue;
}

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

function normalizePinUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl, 'https://www.pinterest.com');
    parsed.hash = '';
    if (!/pinterest\.com$/i.test(parsed.hostname)) {
      return '';
    }

    return parsed.toString();
  } catch (error) {
    return '';
  }
}

function extractPinId(pinKey, pinUrl) {
  if (typeof pinKey === 'string' && pinKey) {
    return pinKey.replace('/pin/', '');
  }

  try {
    const match = new URL(pinUrl || '').pathname.match(/\/pin\/([^/?#]+)/i);
    return match ? match[1] : '';
  } catch (error) {
    return '';
  }
}

function getFailedItems(tabId) {
  return jobHistory.get(tabId)?.failedItems || [];
}

function notifyTab(tabId, payload) {
  chrome.tabs.sendMessage(
    tabId,
    {
      type: 'DOWNLOAD_PROGRESS',
      payload
    },
    () => chrome.runtime.lastError
  );
}
