/* ════════════════════════════════════════════════════════
   Tweet Video Downloader — Content Script (ISOLATED world)
   ════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── Inject the MAIN-world script ──
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('inject.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  // ── State ──
  /** @type {Map<string, Array<{bitrate: number, url: string, resolution: string}>>} */
  const videoDataMap = new Map();
  let activeDropdown = null;

  // ── SVG icon (down-arrow) ──
  const DOWNLOAD_ICON = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 16l-6-6h4V4h4v6h4l-6 6z"/><path d="M4 18h16v2H4z"/></svg>`;

  // ── Listen for video data from inject.js ──
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.type !== 'TVD_VIDEO_DATA') return;
    const { tweetId, variants } = e.data;
    if (tweetId && Array.isArray(variants)) {
      videoDataMap.set(tweetId, variants);
    }
  });

  // ── Toast helper ──
  function showToast(msg) {
    const existing = document.querySelector('.tvd-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'tvd-toast';
    el.textContent = msg;
    document.body.appendChild(el);

    setTimeout(() => el.classList.add('tvd-toast--fade'), 2000);
    setTimeout(() => el.remove(), 2500);
  }

  // ── Extract tweet ID from an article element ──
  function getTweetId(article) {
    const links = article.querySelectorAll('a[href*="/status/"]');
    for (const a of links) {
      const m = a.getAttribute('href').match(/\/status\/(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  // ── Find the video container inside an article ──
  function findVideoContainer(article) {
    return (
      article.querySelector('div[data-testid="videoPlayer"]') ||
      article.querySelector('div[data-testid="videoComponent"]') ||
      article.querySelector('video')?.closest('div')
    );
  }

  // ── Close any open dropdown ──
  function closeDropdown() {
    if (activeDropdown) {
      activeDropdown.remove();
      activeDropdown = null;
    }
  }

  document.addEventListener('click', (e) => {
    if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.closest('.tvd-download-btn')) {
      closeDropdown();
    }
  });

  // ── Format bitrate for display ──
  function formatBitrate(bitrate) {
    if (bitrate >= 1_000_000) return (bitrate / 1_000_000).toFixed(1) + ' Mbps';
    if (bitrate >= 1_000) return Math.round(bitrate / 1_000) + ' kbps';
    return bitrate + ' bps';
  }

  // ── Show quality picker dropdown ──
  function showQualityPicker(button, tweetId) {
    closeDropdown();

    const variants = videoDataMap.get(tweetId);
    if (!variants || variants.length === 0) {
      showToast('No video data captured yet \u2014 try scrolling or refreshing');
      return;
    }

    // Sort best quality first (highest bitrate)
    const sorted = [...variants].sort((a, b) => b.bitrate - a.bitrate);

    const picker = document.createElement('div');
    picker.className = 'tvd-quality-picker';

    // Position: above or below depending on viewport space
    const rect = button.getBoundingClientRect();
    if (rect.bottom + 200 > window.innerHeight) {
      picker.classList.add('tvd-quality-picker--above');
    } else {
      picker.classList.add('tvd-quality-picker--below');
    }

    for (const v of sorted) {
      const row = document.createElement('div');
      row.className = 'tvd-quality-option';

      const label = document.createElement('span');
      label.className = 'tvd-quality-label';
      label.textContent = v.resolution;

      const br = document.createElement('span');
      br.className = 'tvd-quality-bitrate';
      br.textContent = formatBitrate(v.bitrate);

      row.appendChild(label);
      row.appendChild(br);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        downloadVariant(v, tweetId);
      });

      picker.appendChild(row);
    }

    // Anchor to the button's parent (which has position:relative via the video container)
    button.parentElement.appendChild(picker);
    activeDropdown = picker;
  }

  // ── Trigger download via background ──
  async function downloadVariant(variant, tweetId) {
    const filename = `tweet_${tweetId}_${variant.resolution}.mp4`;
    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'download',
        url: variant.url,
        filename,
      });
      if (resp && resp.error) {
        showToast('Download failed: ' + resp.error);
      } else {
        showToast('Downloading ' + variant.resolution + '...');
      }
    } catch (err) {
      showToast('Download failed: ' + err.message);
    }
  }

  // ── Process a single tweet article ──
  function processTweet(article) {
    if (article.hasAttribute('data-tvd-processed')) return;

    const videoContainer = findVideoContainer(article);
    if (!videoContainer) return;

    const tweetId = getTweetId(article);
    if (!tweetId) return;

    article.setAttribute('data-tvd-processed', '1');

    // Ensure the container is positioned so the absolute button anchors correctly
    const containerStyle = getComputedStyle(videoContainer);
    if (containerStyle.position === 'static') {
      videoContainer.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.className = 'tvd-download-btn';
    btn.innerHTML = DOWNLOAD_ICON;
    btn.title = 'Download video';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showQualityPicker(btn, tweetId);
    });

    videoContainer.appendChild(btn);
  }

  // ── Scan the DOM for tweet articles ──
  function scanForTweets() {
    const articles = document.querySelectorAll('article[data-testid="tweet"], article');
    articles.forEach(processTweet);
  }

  // ── MutationObserver for SPA navigation ──
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) scanForTweets();
  });

  // Wait for body to exist, then start observing
  function startObserver() {
    if (!document.body) {
      requestAnimationFrame(startObserver);
      return;
    }
    observer.observe(document.body, { childList: true, subtree: true });
    scanForTweets();
  }

  startObserver();

  // ── Handle SPA URL changes ──
  let lastUrl = location.href;

  window.addEventListener('popstate', () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scanForTweets();
    }
  });

  // Poll for URL changes (pushState doesn't fire popstate)
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scanForTweets();
    }
  }, 1000);
})();
