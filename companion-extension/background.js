/**
 * ViveStream PO Token Companion - Service Worker (Background Script)
 * System-wide interception of YouTube BotGuard PO tokens via webRequest, stats beacons, and MAIN-world DOM inspection.
 */

// In-memory log buffer (persisted to chrome.storage.local)
async function addLog(message, level = "info") {
  const timeStr = new Date().toLocaleTimeString();
  const entry = { time: timeStr, message, level, timestamp: Date.now() };
  console.log(`[ViveStream SW] [${level.toUpperCase()}] ${message}`);

  try {
    const data = await chrome.storage.local.get("activityLogs");
    const logs = Array.isArray(data.activityLogs) ? data.activityLogs : [];
    logs.unshift(entry);
    if (logs.length > 120) logs.pop();
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
  await addLog(
    `Captured PO Token (${clean.length} chars) from ${source}${videoId ? ` [Video: ${videoId}]` : ""}`,
    "success"
  );

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

// Helper: extract video ID from URL
function extractVideoId(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has("v")) return parsed.searchParams.get("v");
    if (parsed.searchParams.has("docid")) return parsed.searchParams.get("docid");
    const parts = parsed.pathname.split("/").filter(Boolean);
    if ((parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "watch") && parts[1]) {
      return parts[1];
    }
  } catch (_) {}
  return null;
}

// 1. WebRequest Interceptor: Catches googlevideo.com, stats beacons, and Innertube requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    try {
      const url = new URL(details.url);

      // Check googlevideo.com media playback requests (video/audio chunks)
      if (url.hostname.includes("googlevideo.com") || url.pathname.includes("/videoplayback")) {
        const pot =
          url.searchParams.get("pot") ||
          url.searchParams.get("po_token") ||
          url.searchParams.get("cpo");

        const videoId = extractVideoId(details.initiator || details.documentUrl || details.url);

        if (pot && pot.length >= 16) {
          handleCapturedToken(pot, "googlevideo_media_chunk", videoId, details.url);
          return;
        }

        // Keep track of observed query keys for diagnostics
        const paramKeys = Array.from(url.searchParams.keys());
        chrome.storage.local.set({
          lastMediaChunkDiag: {
            host: url.hostname,
            pathname: url.pathname,
            paramKeys: paramKeys.slice(0, 20),
            hasPot: !!pot,
            time: Date.now(),
          },
        });
        return;
      }

      // Check YouTube Stats Beacons (/api/stats/playback, /api/stats/watchtime, /api/stats/qoe)
      if (url.pathname.includes("/api/stats/")) {
        const pot =
          url.searchParams.get("pot") ||
          url.searchParams.get("po_token") ||
          url.searchParams.get("cpo");
        if (pot && pot.length >= 16) {
          const videoId = url.searchParams.get("docid") || extractVideoId(details.initiator || details.documentUrl || "");
          handleCapturedToken(pot, `stats_beacon_${url.pathname.split("/").pop()}`, videoId, details.url);
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

// 3. Deep scanner function executed inside active tab in MAIN world
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
      world: "MAIN", // Crucial for ytcfg, movie_player, and playerResponse
      func: () => {
        const diag = {
          url: window.location.href,
          title: document.title,
          videoId: null,
          isPlaying: false,
          currentTime: 0,
          duration: 0,
          ytcfgPresent: !!window.ytcfg,
          visitorData: null,
          tokenFound: null,
          tokenSource: null,
          totalResources: 0,
          googlevideoCount: 0,
          googlevideoParamKeys: [],
          trackingUrlsChecked: 0,
          hasMoviePlayer: false,
          hasPlayerResponse: false,
        };

        // Extract video ID from URL
        try {
          const parsed = new URL(window.location.href);
          if (parsed.searchParams.has("v")) diag.videoId = parsed.searchParams.get("v");
        } catch (_) {}

        // 1. Inspect Video Element
        const video = document.querySelector("video");
        if (video) {
          diag.isPlaying = !video.paused;
          diag.currentTime = Math.round(video.currentTime || 0);
          diag.duration = Math.round(video.duration || 0);
        }

        // 2. Inspect window.ytcfg
        try {
          if (window.ytcfg) {
            diag.visitorData =
              (typeof window.ytcfg.get === "function" ? window.ytcfg.get("VISITOR_DATA") : null) ||
              window.ytcfg.data_?.INNERTUBE_CONTEXT?.client?.visitorData ||
              null;

            const cfgToken =
              (typeof window.ytcfg.get === "function" ? window.ytcfg.get("PO_TOKEN") : null) ||
              window.ytcfg.data_?.PO_TOKEN ||
              window.ytcfg.data_?.INNERTUBE_CONTEXT?.serviceIntegrityDimensions?.poToken;

            if (cfgToken && typeof cfgToken === "string" && cfgToken.length >= 16) {
              diag.tokenFound = cfgToken;
              diag.tokenSource = "ytcfg_direct";
            }
          }
        } catch (_) {}

        // 3. Inspect movie_player element & playerResponse
        try {
          const player = document.getElementById("movie_player");
          if (player) {
            diag.hasMoviePlayer = true;
            const videoData = player.getVideoData?.();
            if (videoData) {
              diag.videoId = videoData.video_id || diag.videoId;
              diag.title = videoData.title || diag.title;
            }

            const playerResponse = player.getPlayerResponse?.();
            if (playerResponse) {
              diag.hasPlayerResponse = true;

              // Check tracking URLs in playbackTracking
              const tracking = playerResponse.playbackTracking || {};
              const trackingUrls = [
                tracking.videostatsPlaybackUrl?.baseUrl,
                tracking.videostatsWatchtimeUrl?.baseUrl,
                tracking.qoeUrl?.baseUrl,
                tracking.ptrackingUrl?.baseUrl,
                tracking.atrUrl?.baseUrl,
              ].filter(Boolean);

              diag.trackingUrlsChecked = trackingUrls.length;

              for (const trackUrl of trackingUrls) {
                try {
                  const parsedTrack = new URL(trackUrl);
                  const pot =
                    parsedTrack.searchParams.get("pot") ||
                    parsedTrack.searchParams.get("po_token") ||
                    parsedTrack.searchParams.get("cpo");
                  if (pot && pot.length >= 16 && !diag.tokenFound) {
                    diag.tokenFound = pot;
                    diag.tokenSource = `player_tracking_${parsedTrack.pathname.split("/").pop()}`;
                    break;
                  }
                } catch (_) {}
              }

              // Check streamingData format URLs if still not found
              if (!diag.tokenFound && playerResponse.streamingData?.adaptiveFormats) {
                for (const fmt of playerResponse.streamingData.adaptiveFormats.slice(0, 5)) {
                  if (fmt.url) {
                    try {
                      const fmtUrl = new URL(fmt.url);
                      const pot = fmtUrl.searchParams.get("pot") || fmtUrl.searchParams.get("po_token");
                      if (pot && pot.length >= 16) {
                        diag.tokenFound = pot;
                        diag.tokenSource = "player_adaptive_format_url";
                        break;
                      }
                    } catch (_) {}
                  }
                }
              }
            }
          }
        } catch (_) {}

        // 4. Inspect Performance Resource Timing
        try {
          const resources = performance.getEntriesByType("resource");
          diag.totalResources = resources.length;
          const paramKeysSet = new Set();

          for (let i = resources.length - 1; i >= 0; i--) {
            const res = resources[i];
            const name = res.name || "";

            // Check googlevideo.com chunks
            if (name.includes("googlevideo.com") || name.includes("/videoplayback")) {
              diag.googlevideoCount++;
              try {
                const url = new URL(name);
                for (const k of url.searchParams.keys()) {
                  paramKeysSet.add(k);
                }

                if (!diag.tokenFound) {
                  const pot =
                    url.searchParams.get("pot") ||
                    url.searchParams.get("po_token") ||
                    url.searchParams.get("cpo");
                  if (pot && pot.length >= 16) {
                    diag.tokenFound = pot;
                    diag.tokenSource = "performance_googlevideo_chunk";
                  }
                }
              } catch (_) {}
            }

            // Check stats beacons
            if (name.includes("/api/stats/")) {
              try {
                const url = new URL(name);
                if (!diag.tokenFound) {
                  const pot =
                    url.searchParams.get("pot") ||
                    url.searchParams.get("po_token") ||
                    url.searchParams.get("cpo");
                  if (pot && pot.length >= 16) {
                    diag.tokenFound = pot;
                    diag.tokenSource = "performance_stats_beacon";
                  }
                }
              } catch (_) {}
            }
          }

          diag.googlevideoParamKeys = Array.from(paramKeysSet).slice(0, 25);
        } catch (_) {}

        return diag;
      },
    });

    const diag = results?.[0]?.result;
    if (!diag) {
      await addLog("Scan failed: could not execute script in active tab.", "error");
      return { error: "Could not read tab state" };
    }

    // Persist full diagnostics
    await chrome.storage.local.set({ lastDiagnostics: diag });

    // If token found, process and store
    if (diag.tokenFound) {
      await handleCapturedToken(diag.tokenFound, diag.tokenSource, diag.videoId, tab.url);
      await addLog(
        `✓ Token successfully extracted via ${diag.tokenSource} (${diag.tokenFound.length} chars)`,
        "success"
      );
      return { success: true, token: diag.tokenFound, source: diag.tokenSource, diag };
    }

    // Informative logs for developer and user
    await addLog(
      `Scan: Tab "${(diag.title || "YouTube").slice(0, 30)}..." | Video: ${diag.videoId || "N/A"} | Playing: ${diag.isPlaying ? "YES" : "NO"} (${diag.currentTime}s)`,
      diag.isPlaying ? "info" : "warning"
    );

    await addLog(
      `Scan: ${diag.googlevideoCount} googlevideo chunks, ${diag.totalResources} total resources. Params: [${diag.googlevideoParamKeys.slice(0, 8).join(", ") || "none"}]`,
      diag.googlevideoCount > 0 ? "info" : "warning"
    );

    if (diag.trackingUrlsChecked > 0) {
      await addLog(
        `Scan: Checked ${diag.trackingUrlsChecked} player tracking URLs and ytcfg (VisitorData: ${diag.visitorData ? "found" : "none"}).`,
        "info"
      );
    }

    if (diag.googlevideoCount === 0) {
      await addLog("No googlevideo chunks detected yet. Ensure the video is playing with sound.", "warning");
      return {
        warning: "Video is not requesting stream chunks yet. Let it play 2 seconds, then scan again.",
        diag,
      };
    } else {
      await addLog(
        `Media chunks are active without 'pot' param (keys: [${diag.googlevideoParamKeys.slice(0, 6).join(", ")}]). BotGuard may be generating token.`,
        "warning"
      );
      return {
        warning: `Observed ${diag.googlevideoCount} media chunks without 'pot'. Let playback continue 2-3s for BotGuard evaluation.`,
        diag,
      };
    }
  } catch (err) {
    await addLog(`Scan error: ${err.message}`, "error");
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
  if (request.action === "GET_DIAGNOSTICS") {
    chrome.storage.local.get(["latestPoToken", "activityLogs", "lastDiagnostics", "lastMediaChunkDiag"]).then((data) => {
      sendResponse(data);
    });
    return true;
  }
});
