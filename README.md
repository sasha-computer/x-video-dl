<p align="center">
  <img src="assets/hero.png" alt="tweet-video-dl" width="200" />
</p>

<h1 align="center">tweet-video-dl</h1>

<p align="center">
  A Chrome extension that downloads videos from tweets with quality selection.
</p>

<p align="center">
  <a href="#why">Why?</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#installation">Installation</a> ·
  <a href="#usage">Usage</a>
</p>

## Why?

You're on Twitter, you find a video you want to keep, and your options are: a sketchy third-party site that wraps the video in five layers of ads, a command-line tool that needs a tweet URL pasted in, or screen recording like it's 2015.

**tweet-video-dl fixes this.** One click on the video, pick your quality, done. The mp4 lands in your Downloads folder.

## How it works

The extension intercepts Twitter's own API responses as they stream in, extracting the direct mp4 URLs and bitrate metadata that Twitter already sends to your browser. No external services, no API keys, no scraping.

- Download button appears on every video tweet, directly on the video player
- Quality picker shows all available resolutions (360p, 480p, 720p, 1080p) sorted best-first
- Downloads save to a configurable subfolder in your Downloads directory
- Works on both `x.com` and `twitter.com`
- Dark and light mode support
- Zero dependencies, no build step

## Installation

This is an unpacked Chrome extension. It works in Chrome, Chromium, and any Chromium fork (Brave, Arc, Helium, etc.).

1. Clone or download this repo
2. Open `chrome://extensions` in your browser
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked**
5. Select the `tweet-video-dl` folder

## Usage

1. Navigate to any tweet with a video
2. A small download button appears in the bottom-right corner of the video
3. Click it to see available quality options
4. Pick a resolution and the video downloads immediately

**Configure the download folder** by clicking the extension icon in your toolbar. The folder is relative to your browser's default Downloads directory (default: `TweetVideos`).

**Tip:** If the quality picker says "No video data captured yet," scroll past the tweet and back, or refresh the page. The extension needs to see Twitter's API response to capture the video URLs.

## Architecture

| File | Role |
|---|---|
| `inject.js` | Runs in the page context. Intercepts `fetch` and `XMLHttpRequest` to capture video variant data from Twitter's GraphQL API responses. |
| `content.js` | Runs in the extension context. Observes the DOM for video tweets, adds download buttons, shows the quality picker, and communicates with the service worker. |
| `content.css` | Styles for the download button, quality dropdown, and toast notifications. |
| `background.js` | Service worker. Handles file downloads via `chrome.downloads` and reads folder settings from `chrome.storage.sync`. |
| `popup.html` / `popup.js` | Extension popup for configuring the download subfolder. |

## License

MIT
