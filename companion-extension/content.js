/**
 * ViveStream PO Token Companion - Content Script
 * Receives intercepted tokens from MAIN world, saves to chrome.storage.local,
 * and pushes directly to ViveStream local server (127.0.0.1:1422) if active.
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
      syncStatus: "pending",
    };

    // Store locally in extension storage for the popup UI
    try {
      await chrome.storage.local.set({ latestPoToken: tokenData });
    } catch (e) {
      console.warn("[ViveStream Companion] Failed to save to chrome.storage:", e);
    }

    // Attempt direct loopback push to ViveStream desktop app
    try {
      const response = await fetch("http://127.0.0.1:1422/api/po-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: payload.token,
          visitor_data: payload.visitorData,
          video_id: payload.videoId,
          source: "companion_extension",
        }),
      });

      if (response.ok) {
        tokenData.syncStatus = "synced";
        await chrome.storage.local.set({
          latestPoToken: tokenData,
          lastSyncTime: Date.now(),
        });
        console.log("[ViveStream Companion] Successfully auto-synced PO token to ViveStream app!");
      }
    } catch (_) {
      // ViveStream desktop app might not be running or listening yet; user can still copy-paste
      tokenData.syncStatus = "ready_for_manual";
      await chrome.storage.local.set({ latestPoToken: tokenData });
    }
  });
})();
