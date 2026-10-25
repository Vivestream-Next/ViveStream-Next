/**
 * ViveStream PO Token Companion - Content Script
 * Relays tokens and diagnostic events from YouTube page to extension storage and desktop app.
 */
(function () {
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "VIVESTREAM_PO_TOKEN_EXTRACTED") return;

    const payload = event.data;
    if (!payload.token || typeof payload.token !== "string") return;

    const tokenData = {
      token: payload.token,
      visitorData: payload.visitorData || null,
      videoId: payload.videoId || null,
      capturedAt: payload.timestamp || Date.now(),
      sourceUrl: window.location.href,
      source: payload.source || "page_hook",
      syncStatus: "pending",
    };

    // Store in extension storage
    try {
      await chrome.storage.local.set({ latestPoToken: tokenData });
      chrome.runtime.sendMessage({
        action: "ADD_LOG",
        message: `Content script received PO token (${payload.token.length} chars) from ${payload.source}`,
        level: "success",
      }).catch(() => {});
    } catch (_) {}

    // Direct push to ViveStream desktop loopback server
    try {
      const response = await fetch("http://127.0.0.1:1422/api/po-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: payload.token,
          visitor_data: payload.visitorData,
          video_id: payload.videoId,
          source: "companion_extension_content_script",
        }),
      });

      if (response.ok) {
        tokenData.syncStatus = "synced";
        await chrome.storage.local.set({ latestPoToken: tokenData, lastSyncTime: Date.now() });
        chrome.runtime.sendMessage({
          action: "ADD_LOG",
          message: "Synced PO token to ViveStream desktop app (port 1422)",
          level: "success",
        }).catch(() => {});
      }
    } catch (_) {
      tokenData.syncStatus = "ready_for_manual";
      await chrome.storage.local.set({ latestPoToken: tokenData });
    }
  });
})();
