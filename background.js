/** @file background.js — Service worker for X Video Downloader (MV3) */

const DEFAULT_FOLDER = 'x-video-dl';

/**
 * Sanitize folder name: keep alphanumeric, hyphens, underscores, spaces, slashes.
 * Replace anything else with underscore. Collapse consecutive underscores.
 * Trim leading/trailing whitespace and slashes.
 */
function sanitizeFolder(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return DEFAULT_FOLDER;
  return raw
    .replace(/[^a-zA-Z0-9\-_ /\\]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[\s/\\]+|[\s/\\]+$/g, '')
    || DEFAULT_FOLDER;
}

async function getFolder() {
  try {
    const result = await chrome.storage.sync.get({ downloadFolder: DEFAULT_FOLDER });
    return sanitizeFolder(result.downloadFolder);
  } catch {
    return DEFAULT_FOLDER;
  }
}

async function handleDownload(url, filename) {
  const folder = await getFolder();
  const fullPath = folder + '/' + filename;

  return new Promise((resolve) => {
    chrome.downloads.download(
      {
        url,
        filename: fullPath,
        conflictAction: 'uniquify',
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve({ success: true, downloadId });
        }
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'download') {
    handleDownload(message.url, message.filename).then(sendResponse);
    return true; // keep channel open for async sendResponse
  }

  if (message.action === 'getFolder') {
    getFolder().then((folder) => sendResponse({ folder }));
    return true;
  }
});
