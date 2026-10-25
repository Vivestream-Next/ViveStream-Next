# ViveStream PO Token Companion Extension

A lightweight, companion browser extension for **ViveStream-Next** that extracts Proof of Origin (PO) tokens from YouTube to unlock unthrottled 1080p, 1440p, and 4K music playback.

---

## Why Is This Needed?

YouTube requires a Proof of Origin (PO) token generated via BotGuard attestation to prevent bot abuse and access high-bitrate video streams. Because music videos often have external iframe embedding disabled by creators, background headless players fail to generate tokens.

By playing videos directly in your everyday browser (Chrome, Brave, Edge, Opera), YouTube performs normal browser attestation. This extension intercepts the active PO token and passes it directly to your ViveStream desktop app.

---

## Installation (Takes 30 seconds)

### For Google Chrome, Brave, Opera, & Vivaldi:
1. Open your browser and navigate to: `chrome://extensions` (or `brave://extensions`)
2. In the top-right corner, toggle on **Developer mode**.
3. Click the **Load unpacked** button in the top-left.
4. Select this directory:
   ```
   companion-extension
   ```
5. Pin the **ViveStream PO Token Companion** icon to your browser toolbar.

### For Microsoft Edge:
1. Navigate to: `edge://extensions`
2. In the left sidebar, turn on **Developer mode**.
3. Click **Load unpacked** and select this `companion-extension` directory.

---

## How to Use

1. Browse to any video on [YouTube](https://www.youtube.com) and click play.
2. Within 2-3 seconds, the extension icon will show an active status badge.
3. Click the extension icon:
   - Click **Sync to ViveStream** to automatically transfer the token to your open ViveStream player.
   - Or click **Copy PO Token** and paste it into **ViveStream &rarr; Settings &rarr; Engine Preferences &rarr; YouTube PO Token**.
4. The token remains cached for **12 hours**, giving you uninterrupted high-resolution streaming.

---

## Privacy & Policy Compliance

- **No Data Harvesting**: Tokens are only transmitted locally to your loopback port (`127.0.0.1:1422`). No third-party servers are involved.
- **Fair Personal Use**: Intended solely for personal media discovery and streaming inside ViveStream-Next. Mass scraping or commercial redistribution is strictly prohibited.
