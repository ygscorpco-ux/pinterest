const activeObjectUrls = new Set();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === 'OFFSCREEN_CREATE_OBJECT_URL') {
    createObjectUrl(message.payload)
      .then((objectUrl) => {
        sendResponse({ ok: true, objectUrl });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || 'Offscreen blob URL creation failed.' });
      });

    return true;
  }

  if (message.type === 'OFFSCREEN_REVOKE_OBJECT_URL') {
    revokeObjectUrl(message.payload?.objectUrl);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function createObjectUrl(payload) {
  const blob = new Blob([payload?.buffer], {
    type: payload?.mimeType || 'application/octet-stream'
  });
  const objectUrl = URL.createObjectURL(blob);
  activeObjectUrls.add(objectUrl);
  return objectUrl;
}

function revokeObjectUrl(objectUrl) {
  if (!objectUrl || !activeObjectUrls.has(objectUrl)) {
    return;
  }

  activeObjectUrls.delete(objectUrl);
  URL.revokeObjectURL(objectUrl);
}

window.addEventListener('unload', () => {
  for (const objectUrl of activeObjectUrls) {
    URL.revokeObjectURL(objectUrl);
  }

  activeObjectUrls.clear();
});
