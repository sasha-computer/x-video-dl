(function () {
  'use strict';

  const GRAPHQL_PATTERNS = [
    '/TweetDetail',
    '/TweetResultByRestId',
    '/graphql/',
    '/i/api/graphql/',
  ];
  const TWEET_RE = /tweet/i;
  const RESOLUTION_RE = /\/(\d{2,4})x(\d{2,4})\//;

  function shouldIntercept(url) {
    if (TWEET_RE.test(url)) return true;
    for (let i = 0; i < GRAPHQL_PATTERNS.length; i++) {
      if (url.includes(GRAPHQL_PATTERNS[i])) return true;
    }
    return false;
  }

  function bitrateToQuality(bitrate) {
    if (bitrate < 400000) return '360p';
    if (bitrate < 900000) return '480p';
    if (bitrate < 3000000) return '720p';
    if (bitrate < 6000000) return '1080p';
    return '4K';
  }

  function extractResolution(url, bitrate) {
    const m = RESOLUTION_RE.exec(url);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      return Math.max(a, b) + 'p';
    }
    return bitrateToQuality(bitrate || 0);
  }

  function extractVariants(videoInfo) {
    if (!videoInfo || !Array.isArray(videoInfo.variants)) return [];
    const out = [];
    for (const v of videoInfo.variants) {
      if (v.content_type !== 'video/mp4') continue;
      const bitrate = v.bitrate || 0;
      out.push({
        bitrate,
        url: v.url,
        resolution: extractResolution(v.url, bitrate),
      });
    }
    out.sort((a, b) => b.bitrate - a.bitrate);
    return out;
  }

  /**
   * Walk the parsed API response and collect { tweetId, variants[] } for every
   * tweet that contains at least one mp4 video variant.
   *
   * Twitter nests tweet data in many shapes. The reliable signal is:
   *   tweet object → has `rest_id` (or `id_str`)
   *   tweet object → legacy.extended_entities.media[].video_info
   *
   * We also handle the case where `video_info` appears in a different subtree
   * (e.g. inside `mediaStats`) by doing a secondary recursive sweep for
   * orphaned video_info nodes and attaching them to the nearest ancestor tweet.
   */
  function collectTweetsWithVideo(root) {
    const results = new Map(); // tweetId → variants[]

    function processTweet(tweetObj) {
      const tweetId = tweetObj.rest_id || tweetObj.id_str;
      if (!tweetId) return;

      const mediaSources = [];
      const legacy = tweetObj.legacy;
      if (legacy) {
        const ee = legacy.extended_entities;
        if (ee && Array.isArray(ee.media)) mediaSources.push(...ee.media);
        const e = legacy.entities;
        if (e && Array.isArray(e.media)) mediaSources.push(...e.media);
      }
      // Also check top-level extended_entities (some response shapes)
      if (tweetObj.extended_entities && Array.isArray(tweetObj.extended_entities.media)) {
        mediaSources.push(...tweetObj.extended_entities.media);
      }
      if (tweetObj.entities && Array.isArray(tweetObj.entities.media)) {
        mediaSources.push(...tweetObj.entities.media);
      }

      const seen = new Set();
      for (const media of mediaSources) {
        if (!media.video_info) continue;
        const variants = extractVariants(media.video_info);
        for (const v of variants) {
          if (seen.has(v.url)) continue;
          seen.add(v.url);
          if (!results.has(tweetId)) results.set(tweetId, []);
          results.get(tweetId).push(v);
        }
      }
    }

    // Fallback: find video_info anywhere and try to associate with nearest tweet id
    function walkForOrphans(obj, currentTweetId) {
      if (obj == null || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) walkForOrphans(item, currentTweetId);
        return;
      }

      let tid = currentTweetId;
      if (obj.rest_id) tid = obj.rest_id;
      else if (obj.id_str) tid = obj.id_str;

      if (obj.video_info && tid && !results.has(tid)) {
        const variants = extractVariants(obj.video_info);
        if (variants.length > 0) {
          results.set(tid, variants);
        }
      }

      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        walkForOrphans(obj[key], tid);
      }
    }

    // Primary pass: find tweet objects with rest_id/id_str
    function walk(obj) {
      if (obj == null || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (const item of obj) walk(item);
        return;
      }

      if (obj.rest_id || obj.id_str) {
        processTweet(obj);
      }

      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        walk(obj[key]);
      }
    }

    walk(root);
    // Secondary pass for orphaned video_info nodes
    walkForOrphans(root, null);

    return results;
  }

  function postResults(tweetsMap) {
    tweetsMap.forEach(function (variants, tweetId) {
      if (variants.length === 0) return;
      window.postMessage(
        { type: 'TVD_VIDEO_DATA', tweetId: tweetId, variants: variants },
        '*'
      );
    });
  }

  async function processResponse(response) {
    try {
      const cloned = response.clone();
      const json = await cloned.json();
      const tweetsMap = collectTweetsWithVideo(json);
      if (tweetsMap.size > 0) postResults(tweetsMap);
    } catch (_) {
      // Response wasn't JSON or parsing failed — ignore silently
    }
  }

  // --- Intercept fetch ---
  const originalFetch = window.fetch;
  window.fetch = function () {
    const url =
      arguments[0] instanceof Request ? arguments[0].url : String(arguments[0]);
    const promise = originalFetch.apply(this, arguments);

    if (shouldIntercept(url)) {
      promise.then(function (response) {
        processResponse(response);
      }).catch(function () {
        // Network error — don't break the page
      });
    }

    return promise;
  };

  // --- Intercept XMLHttpRequest ---
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._tvdUrl = typeof url === 'string' ? url : String(url);
    return XHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this._tvdUrl && shouldIntercept(this._tvdUrl)) {
      this.addEventListener('load', function () {
        try {
          const json = JSON.parse(this.responseText);
          const tweetsMap = collectTweetsWithVideo(json);
          if (tweetsMap.size > 0) postResults(tweetsMap);
        } catch (_) {
          // Not JSON or parse failure — ignore
        }
      });
    }
    return XHRSend.apply(this, arguments);
  };
})();
