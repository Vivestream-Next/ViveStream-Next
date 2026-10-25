/**
 * ViveStream PO Token Companion - Service Worker (Background Script)
 * System-wide interception of YouTube BotGuard PO tokens via webRequest and tab inspection.
 */

// In-memory log buffer (persisted to chrome.storage.local)
async function addLog(message, level = "info") {
  const timeStr = new Date().toLocaleTimeString();
  const entry = { time: timeStr, message, level };
  console.log(`[ViveStream SW] [${level.toUpperCase()}] ${message}`);

  try {
    const data = await chrome.storage.local.get("activityLogs");
    const logs = Array.isArray(data.activityLogs) ? data.activityLogs : [];
    logs.unshift(entry);
    if (logs.length > 60) logs.pop();
    await chrome.storage.local.set({ activityLogs: logs });
  } catch (_) {}
}

// Process and store token
async function handleCapturedToken(token, source, videoId = null, url = null) {
  if (!token || typeof token !== "string") return;
  const clean = token.trim();
  if (clean.length < 16) return;

  const data = await chrome.storage.local.get("latestPoToken");
  if (data?.latestPoToken?.token === clean) {
    // Already active and cached
    return;
  }

  const tokenData = {
    token: clean,
    videoId: videoId || null,
    source: source || "web_request",
    capturedAt: Date.now(),
    sourceUrl: url || "",
    syncStatus: "pending",
  };

  await chrome.storage.local.set({ latestPoToken: tokenData });
  await addLog(`Captured PO Token (${clean.length} chars) from ${source}${videoId ? ` [Video: ${videoId}]` : ""}`, "success");

  // Attempt sync to ViveStream loopback
  try {
    const res = await fetch("http://127.0.0.1:1422/api/po-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: clean,
        video_id: videoId,
        source: `companion_extension_${source}`,
      }),
    });

    if (res.ok) {
      tokenData.syncStatus = "synced";
      await chrome.storage.local.set({ latestPoToken: tokenData, lastSyncTime: Date.now() });
      await addLog("Successfully synchronized PO token to ViveStream desktop app!", "success");
    } else {
      tokenData.syncStatus = "offline";
      await chrome.storage.local.set({ latestPoToken: tokenData });
      await addLog("ViveStream desktop app returned error during sync.", "warning");
    }
  } catch (_) {
    tokenData.syncStatus = "offline";
    await chrome.storage.local.set({ latestPoToken: tokenData });
    await addLog("ViveStream desktop app offline on port 1422 (ready for manual copy).", "info");
  }
}

// 1. WebRequest Interceptor: Catches googlevideo.com and youtube.com requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const url = new URL(details.url);

      // Check googlevideo.com media playback requests (every video chunk has pot=)
      if (url.hostname.includes("googlevideo.com")) {
        const pot = url.searchParams.get("pot") || url.searchParams.get("po_token");
        if (pot && pot.length >= 16) {
          const docUrl = details.initiator || details.documentUrl || "";
          let videoId = null;
          try {
            const parsedDoc = new URL(docUrl);
            videoId = parsedDoc.searchParams.get("v");
          } catch (_) {}

          handleCapturedToken(pot, "googlevideo_media_chunk", videoId, details.url);
          return;
        }
      }

      // Check youtube.com/youtubei/v1/player or next requests
      if (url.pathname.includes("/youtubei/v1/")) {
        // Check query params
        const pot = url.searchParams.get("pot") || url.searchParams.get("po_token");
        if (pot && pot.length >= 16) {
          handleCapturedToken(pot, "youtubei_url_query", null, details.url);
          return;
        }

        // Check request body
        if (details.requestBody && details.requestBody.raw) {
          for (const raw of details.requestBody.raw) {
            if (raw.bytes) {
              try {
                const text = new TextDecoder().decode(raw.bytes);
                const match = text.match(/"(?:po_?token|poToken)"\s*:\s*"([^"]{16,})"/i);
                if (match && match[1]) {
                  handleCapturedToken(match[1], "youtubei_request_body", null, details.url);
                  return;
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}
  },
  { urls: ["*://*.youtube.com/*", "*://*.googlevideo.com/*"] },
  ["requestBody"]
);

// 2. Programmatically inject content scripts into open YouTube tabs on extension load/update
async function injectOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "*://*.youtube.com/*" });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["injected.js"],
          world: "MAIN",
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        });
        await addLog(`Injected tracking hooks into active YouTube tab [${tab.id}]`, "info");
      } catch (_) {}
    }
  } catch (_) {}
}

chrome.runtime.onInstalled.addListener(() => {
  addLog("ViveStream PO Token Companion installed and listening for YouTube streams.", "info");
  injectOpenTabs();
});

// 3. Deep scanner function executed inside active tab
async function scanActiveTabNow() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    return { error: "No active browser tab found" };
  }
  if (!tab.url || !tab.url.includes("youtube.com")) {
    return { error: "Active tab is not YouTube (open youtube.com and play a video)" };
  }

  await addLog(`Scanning active YouTube tab: ${tab.title || tab.url}...`, "info");

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // 1. Scan Performance Resource Timing for googlevideo chunks
        const resources = performance.getEntriesByType("resource");
        for (let i = resources.length - 1; i >= 0; i--) {
          const res = resources[i];
          if (res.name && res.name.includes("googlevideo.com")) {
            try {
              const url = new URL(res.name);
              const pot = url.searchParams.get("pot") || url.searchParams.get("po_token");
              if (pot && pot.length >= 16) {
                return {
                  token: pot,
                  source: "performance_resource_buffer",
                  chunkUrl: res.name.slice(0, 80) + "...",
                };
              }
            } catch (_) {}
          }
        }

        // 2. Check window.ytcfg
        try {
          if (window.ytcfg) {
            const tok =
              (typeof window.ytcfg.get === "function" ? window.ytcfg.get("PO_TOKEN") : null) ||
              window.ytcfg.data_?.PO_TOKEN ||
              window.ytcfg.data_?.INNERTUBE_CONTEXT?.serviceIntegrityDimensions?.poToken;
            if (tok && typeof tok === "string" && tok.length >= 16) {
              return { token: tok, source: "ytcfg" };
            }
          }
        } catch (_) {}

        // 3. Check video element & player state
        const video = document.querySelector("video");
        const isPlaying = video ? !video.paused : false;

        return {
          notFound: true,
          isPlaying,
          resourcesChecked: resources.length,
          url: window.location.href,
        };
      },
    });

    const result = results?.[0]?.result;
    if (result?.token) {
      const url = new URL(tab.url);
      const videoId = url.searchParams.get("v");
      await handleCapturedToken(result.token, result.source, videoId, tab.url);
      return { success: true, token: result.token, source: result.source };
    }

    if (result?.notFound) {
      await addLog(
        `Tab scanned (${result.resourcesChecked} network resources). Video is ${result.isPlaying ? "PLAYING" : "PAUSED"}. Let it play 2s to request media chunks.`,
        "warning"
      );
      return { warning: "No media chunks with PO token detected yet. Make sure video is playing!" };
    }

    return { error: "Could not read tab state" };
  } catch (err) {
    await addLog(`Scan failed: ${err.message}`, "error");
    return { error: err.message };
  }
}

// 4. Message Router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SCAN_ACTIVE_TAB") {
    scanActiveTabNow().then(sendResponse);
    return true; // async response
  }
  if (request.action === "CLEAR_LOGS") {
    chrome.storage.local.set({ activityLogs: [] }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (request.action === "ADD_LOG") {
    addLog(request.message, request.level || "info").then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});
