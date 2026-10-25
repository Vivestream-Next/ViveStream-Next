/**
 * ViveStream PO Token Companion - Popup Controller
 * Direct MAIN-world DOM inspection, deep stream telemetry, and instant diagnostics copy.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const headerStatusBadge = document.getElementById("headerStatusBadge");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  const ytIndicator = document.getElementById("ytIndicator");
  const ytStatusLabel = document.getElementById("ytStatusLabel");
  const appIndicator = document.getElementById("appIndicator");
  const appStatusLabel = document.getElementById("appStatusLabel");

  const tokenCard = document.getElementById("tokenCard");
  const tokenLengthBadge = document.getElementById("tokenLengthBadge");
  const tokenPreview = document.getElementById("tokenPreview");
  const toggleVisibilityBtn = document.getElementById("toggleVisibilityBtn");
  const tokenMeta = document.getElementById("tokenMeta");
  const metaAge = document.getElementById("metaAge");
  const metaVideo = document.getElementById("metaVideo");
  const metaSource = document.getElementById("metaSource");

  const copyTokenBtn = document.getElementById("copyTokenBtn");
  const copyBtnText = document.getElementById("copyBtnText");
  const syncAppBtn = document.getElementById("syncAppBtn");
  const syncBtnText = document.getElementById("syncBtnText");
  const scanTabBtn = document.getElementById("scanTabBtn");
  const scanBtnText = document.getElementById("scanBtnText");
  const syncBanner = document.getElementById("syncBanner");

  const emptyGuide = document.getElementById("emptyGuide");
  const openYtBtn = document.getElementById("openYtBtn");

  const logTerminal = document.getElementById("logTerminal");
  const clearLogsBtn = document.getElementById("clearLogsBtn");
  const copyLogsBtn = document.getElementById("copyLogsBtn");
  const copyReportBtn = document.getElementById("copyReportBtn");

  let currentToken = null;
  let isMasked = true;
  let isAppOnline = false;

  function formatTimeAgo(timestamp) {
    if (!timestamp) return "Unknown";
    const sec = Math.floor((Date.now() - timestamp) / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  }

  async function appendLog(message, level = "info") {
    const timeStr = new Date().toLocaleTimeString();
    const entry = { time: timeStr, message, level, timestamp: Date.now() };

    try {
      const data = await chrome.storage.local.get("activityLogs");
      const logs = Array.isArray(data.activityLogs) ? data.activityLogs : [];
      logs.unshift(entry);
      if (logs.length > 120) logs.pop();
      await chrome.storage.local.set({ activityLogs: logs });
      renderLogs(logs);
    } catch (_) {}
  }

  function renderLogs(logs) {
    if (!logs || !logs.length) {
      logTerminal.innerHTML = `<div class="log-entry log-entry-info">[${new Date().toLocaleTimeString()}] Listening for YouTube streams... Play any video to capture.</div>`;
      return;
    }

    logTerminal.innerHTML = logs
      .map((entry) => {
        const cls =
          entry.level === "success"
            ? "log-entry-success"
            : entry.level === "warning"
            ? "log-entry-warning"
            : entry.level === "error"
            ? "log-entry-error"
            : "log-entry-info";
        return `<div class="log-entry ${cls}">[${entry.time}] ${entry.message}</div>`;
      })
      .join("");
  }

  function updateDisplay(tokenData) {
    if (!tokenData || !tokenData.token) {
      statusDot.className = "status-dot";
      statusText.textContent = "WAITING";
      tokenLengthBadge.textContent = "0 chars";
      tokenPreview.textContent = "No token captured yet";
      toggleVisibilityBtn.style.display = "none";
      tokenMeta.style.display = "none";
      copyTokenBtn.disabled = true;
      syncAppBtn.disabled = true;
      emptyGuide.style.display = "block";
      currentToken = null;
      return;
    }

    currentToken = tokenData.token;
    emptyGuide.style.display = "none";
    toggleVisibilityBtn.style.display = "block";
    tokenMeta.style.display = "flex";
    copyTokenBtn.disabled = false;
    syncAppBtn.disabled = false;

    const isPo = tokenData.isPoToken !== false && !tokenData.source?.includes("visitor");
    statusDot.className = "status-dot active";
    statusText.textContent = isPo ? "PO TOKEN READY" : "SESSION READY";
    const tokenHeaderLabel = document.querySelector(".token-header .label");
    if (tokenHeaderLabel) {
      tokenHeaderLabel.textContent = isPo ? "CAPTURED PO TOKEN" : "CAPTURED VISITOR SESSION";
    }

    tokenLengthBadge.textContent = `${currentToken.length} chars`;
    renderTokenPreview();

    metaAge.textContent = `Age: ${formatTimeAgo(tokenData.capturedAt)}`;
    metaVideo.textContent = tokenData.videoId ? `Video: ${tokenData.videoId}` : "Web Attestation";
    metaSource.textContent = `Source: ${tokenData.source || "media_chunk"}`;
  }

  function renderTokenPreview() {
    if (!currentToken) return;
    if (isMasked) {
      if (currentToken.length > 28) {
        tokenPreview.textContent = `${currentToken.slice(0, 14)}••••••••${currentToken.slice(-10)}`;
      } else {
        tokenPreview.textContent = "••••••••••••••••";
      }
      toggleVisibilityBtn.textContent = "👁";
      toggleVisibilityBtn.title = "Show full token";
    } else {
      tokenPreview.textContent = currentToken;
      toggleVisibilityBtn.textContent = "🔒";
      toggleVisibilityBtn.title = "Hide token";
    }
  }

  toggleVisibilityBtn.addEventListener("click", () => {
    isMasked = !isMasked;
    renderTokenPreview();
  });

  // Check Active Tab (YouTube status)
  async function checkActiveTabStatus() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url?.includes("youtube.com")) {
        ytIndicator.className = "diag-indicator active";
        ytStatusLabel.textContent = "YouTube Tab: Active";
        return tab;
      } else {
        ytIndicator.className = "diag-indicator";
        ytStatusLabel.textContent = "YouTube Tab: Not open";
        return null;
      }
    } catch (_) {
      ytIndicator.className = "diag-indicator";
      ytStatusLabel.textContent = "YouTube Tab: Unknown";
      return null;
    }
  }

  // Check Desktop Loopback Port 1422
  async function checkDesktopAppStatus() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1000);
      const res = await fetch("http://127.0.0.1:1422/", { method: "HEAD", signal: controller.signal });
      clearTimeout(timeout);
      isAppOnline = true;
      appIndicator.className = "diag-indicator active";
      appStatusLabel.textContent = "ViveStream: Online";
    } catch (_) {
      isAppOnline = false;
      appIndicator.className = "diag-indicator inactive";
      appStatusLabel.textContent = "ViveStream: Offline";
    }
  }

  // Deep inspection function to be executed inside YouTube tab in MAIN world
  function deepTabInspection() {
    const diag = {
      url: window.location.href,
      title: document.title,
      videoId: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      videoSrc: "",
      ytcfgPresent: !!window.ytcfg,
      ytcfgKeys: [],
      visitorData: null,
      tokenFound: null,
      tokenSource: null,
      innertubePoToken: null,
      totalResources: 0,
      googlevideoCount: 0,
      googlevideoParamKeys: [],
      sampleGooglevideoUrl: null,
      statsBeaconCount: 0,
      statsParamKeys: [],
      trackingUrlsChecked: 0,
      trackingUrlsList: [],
      hasMoviePlayer: false,
      hasPlayerResponse: false,
      cookiesPresent: [],
    };

    try {
      const parsed = new URL(window.location.href);
      if (parsed.searchParams.has("v")) diag.videoId = parsed.searchParams.get("v");
    } catch (_) {}

    // 1. Inspect Video Element
    try {
      const video = document.querySelector("video");
      if (video) {
        diag.isPlaying = !video.paused;
        diag.currentTime = Math.round(video.currentTime || 0);
        diag.duration = Math.round(video.duration || 0);
        diag.videoSrc = (video.currentSrc || "").slice(0, 100);
      }
    } catch (_) {}

    // 2. Inspect window.ytcfg
    try {
      if (window.ytcfg) {
        if (window.ytcfg.data_) {
          diag.ytcfgKeys = Object.keys(window.ytcfg.data_);
        }

        diag.visitorData =
          (typeof window.ytcfg.get === "function" ? window.ytcfg.get("VISITOR_DATA") : null) ||
          window.ytcfg.data_?.INNERTUBE_CONTEXT?.client?.visitorData ||
          window.ytcfg.data_?.VISITOR_DATA ||
          null;

        const sidPo = window.ytcfg.data_?.INNERTUBE_CONTEXT?.serviceIntegrityDimensions?.poToken;
        if (sidPo && typeof sidPo === "string" && sidPo.length >= 16) {
          diag.innertubePoToken = sidPo;
          diag.tokenFound = sidPo;
          diag.tokenSource = "ytcfg_innertube_serviceIntegrityDimensions";
        }

        const cfgToken =
          (typeof window.ytcfg.get === "function" ? window.ytcfg.get("PO_TOKEN") : null) ||
          window.ytcfg.data_?.PO_TOKEN;

        if (!diag.tokenFound && cfgToken && typeof cfgToken === "string" && cfgToken.length >= 16) {
          diag.tokenFound = cfgToken;
          diag.tokenSource = "ytcfg_PO_TOKEN";
        }

        if (!diag.tokenFound && window.ytcfg.data_?.PLAYER_VARS?.po_token) {
          diag.tokenFound = window.ytcfg.data_.PLAYER_VARS.po_token;
          diag.tokenSource = "ytcfg_player_vars";
        }

        // Deep search ytcfg.data_ for any string matching potential tokens
        if (!diag.tokenFound && window.ytcfg.data_) {
          const queue = [{ obj: window.ytcfg.data_, depth: 0, path: "ytcfg" }];
          while (queue.length > 0 && queue.length < 500) {
            const current = queue.shift();
            if (!current.obj || typeof current.obj !== "object" || current.depth > 5) continue;
            for (const [key, val] of Object.entries(current.obj)) {
              const currentPath = `${current.path}.${key}`;
              if (typeof val === "string") {
                const lower = key.toLowerCase();
                if ((lower.includes("po_token") || lower.includes("potoken") || lower === "pot") && val.length >= 16) {
                  diag.tokenFound = val;
                  diag.tokenSource = currentPath;
                  break;
                }
              } else if (val && typeof val === "object" && current.depth < 5) {
                queue.push({ obj: val, depth: current.depth + 1, path: currentPath });
              }
            }
            if (diag.tokenFound) break;
          }
        }
      }
    } catch (_) {}

    // 2.5 Inspect window.ytInitialPlayerResponse & window globals
    try {
      diag.windowGlobals = Object.keys(window).filter((k) => {
        const lower = k.toLowerCase();
        return (
          lower.includes("botguard") ||
          lower.includes("webpo") ||
          lower.includes("attest") ||
          lower.startsWith("bg_") ||
          lower === "bg"
        );
      });

      const initPlayer = window.ytInitialPlayerResponse;
      if (initPlayer) {
        if (initPlayer.attestation?.playerAttestationRenderer?.challenge) {
          diag.attestationChallenge = (initPlayer.attestation.playerAttestationRenderer.challenge || "").slice(0, 80);
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

          const tracking = playerResponse.playbackTracking || {};
          const trackingUrls = [
            tracking.videostatsPlaybackUrl?.baseUrl,
            tracking.videostatsWatchtimeUrl?.baseUrl,
            tracking.qoeUrl?.baseUrl,
            tracking.ptrackingUrl?.baseUrl,
            tracking.atrUrl?.baseUrl,
          ].filter(Boolean);

          diag.trackingUrlsChecked = trackingUrls.length;
          diag.trackingUrlsList = trackingUrls.map((u) => {
            try {
              return new URL(u).pathname;
            } catch (_) {
              return (u || "").slice(0, 30);
            }
          });

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

          if (!diag.tokenFound && playerResponse.streamingData?.adaptiveFormats) {
            for (const fmt of playerResponse.streamingData.adaptiveFormats.slice(0, 5)) {
              if (fmt.url) {
                try {
                  const fmtUrl = new URL(fmt.url);
                  const pot =
                    fmtUrl.searchParams.get("pot") ||
                    fmtUrl.searchParams.get("po_token") ||
                    fmtUrl.searchParams.get("cpo");
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
      const gvKeysSet = new Set();
      const statsKeysSet = new Set();

      for (let i = resources.length - 1; i >= 0; i--) {
        const res = resources[i];
        const name = res.name || "";

        if (name.includes("googlevideo.com") || name.includes("/videoplayback")) {
          diag.googlevideoCount++;
          try {
            const url = new URL(name);
            if (!diag.sampleGooglevideoUrl) {
              diag.sampleGooglevideoUrl = `${url.hostname}${url.pathname}?${Array.from(url.searchParams.keys()).slice(0, 8).join("&")}`;
            }
            for (const k of url.searchParams.keys()) {
              gvKeysSet.add(k);
            }

            if (!diag.tokenFound) {
              const pot =
                url.searchParams.get("pot") ||
                url.searchParams.get("po_token") ||
                url.searchParams.get("cpo") ||
                url.searchParams.get("po");
              if (pot && pot.length >= 16) {
                diag.tokenFound = pot;
                diag.tokenSource = "performance_googlevideo_chunk";
              }
            }
          } catch (_) {}
        }

        if (name.includes("/api/stats/")) {
          diag.statsBeaconCount++;
          try {
            const url = new URL(name);
            for (const k of url.searchParams.keys()) {
              statsKeysSet.add(k);
            }
            if (!diag.tokenFound) {
              const pot =
                url.searchParams.get("pot") ||
                url.searchParams.get("po_token") ||
                url.searchParams.get("cpo");
              if (pot && pot.length >= 16) {
                diag.tokenFound = pot;
                diag.tokenSource = `performance_stats_${url.pathname.split("/").pop()}`;
              }
            }
          } catch (_) {}
        }
      }

      diag.googlevideoParamKeys = Array.from(gvKeysSet).slice(0, 25);
      diag.statsParamKeys = Array.from(statsKeysSet).slice(0, 15);
    } catch (_) {}

    // 5. Inspect Cookies
    try {
      const c = document.cookie || "";
      const names = c.split(";").map((p) => p.trim().split("=")[0]);
      diag.cookiesPresent = names.filter((n) =>
        ["VISITOR_INFO1_LIVE", "YSC", "PREF", "GPS", "LOGIN_INFO"].includes(n)
      );
    } catch (_) {}

    return diag;
  }

  // Scan Active Tab Button (Direct MAIN-world execution)
  scanTabBtn.addEventListener("click", async () => {
    scanBtnText.textContent = "SCANNING TAB...";
    scanTabBtn.disabled = true;
    syncBanner.style.display = "none";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        throw new Error("No active tab found. Please open YouTube in your browser.");
      }
      if (!tab.url || !tab.url.includes("youtube.com")) {
        throw new Error("Active tab is not YouTube. Please switch to your YouTube tab and play a video!");
      }

      await appendLog(`Direct scan initiating on tab: ${tab.title?.slice(0, 35)}...`, "info");

      // Execute deep inspection directly in MAIN world
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        func: deepTabInspection,
      });

      const diag = results?.[0]?.result;
      if (!diag) {
        throw new Error("Could not access YouTube tab DOM. Try refreshing the YouTube page (F5).");
      }

      // Persist telemetry
      await chrome.storage.local.set({ lastDiagnostics: diag });

      const effectiveToken = diag.tokenFound || diag.visitorData;
      if (effectiveToken) {
        const isPo = !!diag.tokenFound;
        const tokenData = {
          token: effectiveToken,
          isPoToken: isPo,
          visitorData: diag.visitorData || null,
          videoId: diag.videoId || null,
          source: isPo ? diag.tokenSource : "youtube_visitor_session",
          capturedAt: Date.now(),
          syncStatus: "pending",
        };

        await chrome.storage.local.set({ latestPoToken: tokenData });
        updateDisplay(tokenData);

        await appendLog(
          `✓ ${isPo ? "PO Token" : "YouTube Visitor Session"} Captured (${effectiveToken.length} chars) via ${tokenData.source}!`,
          "success"
        );

        // Direct push to ViveStream port 1422
        try {
          const res = await fetch("http://127.0.0.1:1422/api/po-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: effectiveToken,
              visitor_data: diag.visitorData,
              video_id: diag.videoId,
              source: `companion_direct_scan_${tokenData.source}`,
            }),
          });
          if (res.ok) {
            tokenData.syncStatus = "synced";
            await chrome.storage.local.set({ latestPoToken: tokenData, lastSyncTime: Date.now() });
            await appendLog("Synced session credentials directly to ViveStream desktop app!", "success");
            checkDesktopAppStatus();
          }
        } catch (_) {}

        scanBtnText.textContent = isPo ? "PO TOKEN READY!" : "SESSION SYNCED!";
        scanTabBtn.style.borderColor = "#00ffcc";
        scanTabBtn.style.color = "#00ffcc";
        setTimeout(() => {
          scanBtnText.textContent = "SCAN ACTIVE YOUTUBE TAB";
          scanTabBtn.disabled = false;
        }, 1500);
        return;
      }

      // Informative logging
      await appendLog(
        `Tab: "${(diag.title || "YouTube").slice(0, 30)}..." | Video: ${diag.videoId || "N/A"} | Playing: ${diag.isPlaying ? "YES" : "NO"} (${diag.currentTime}s)`,
        diag.isPlaying ? "info" : "warning"
      );

      await appendLog(
        `Stream: ${diag.googlevideoCount} media chunks, ${diag.statsBeaconCount} stats beacons. Params seen: [${diag.googlevideoParamKeys.slice(0, 8).join(", ") || "none"}]`,
        diag.googlevideoCount > 0 ? "info" : "warning"
      );

      if (diag.trackingUrlsChecked > 0) {
        await appendLog(
          `Tracking URLs: ${diag.trackingUrlsChecked} checked (${diag.trackingUrlsList.join(", ")}). ytcfg: ${diag.ytcfgPresent ? "Yes" : "No"}, VisitorData: ${diag.visitorData ? "Yes" : "No"}.`,
          "info"
        );
      }

      if (diag.googlevideoCount === 0) {
        syncBanner.className = "sync-banner error";
        syncBanner.textContent = "No media chunks requested yet. Press Play on YouTube for 2-3 seconds!";
        syncBanner.style.display = "block";
      } else {
        syncBanner.className = "sync-banner error";
        syncBanner.textContent = `Found ${diag.googlevideoCount} media chunks without 'pot'. Let playback continue 2s for BotGuard evaluation!`;
        syncBanner.style.display = "block";
      }

      setTimeout(() => {
        scanBtnText.textContent = "SCAN ACTIVE YOUTUBE TAB";
        scanTabBtn.disabled = false;
      }, 2000);
    } catch (err) {
      await appendLog(`Scan error: ${err.message}`, "error");
      syncBanner.className = "sync-banner error";
      syncBanner.textContent = err.message || "Scan failed.";
      syncBanner.style.display = "block";
      setTimeout(() => {
        scanBtnText.textContent = "SCAN ACTIVE YOUTUBE TAB";
        scanTabBtn.disabled = false;
      }, 2000);
    }
  });

  // Copy PO Token to clipboard
  copyTokenBtn.addEventListener("click", async () => {
    if (!currentToken) return;
    try {
      await navigator.clipboard.writeText(currentToken);
      copyBtnText.textContent = "COPIED TO CLIPBOARD!";
      copyTokenBtn.style.background = "#ffffff";
      setTimeout(() => {
        copyBtnText.textContent = "COPY PO TOKEN";
        copyTokenBtn.style.background = "";
      }, 2000);
    } catch (e) {
      copyBtnText.textContent = "COPY FAILED";
      console.error(e);
    }
  });

  // Sync to ViveStream
  syncAppBtn.addEventListener("click", async () => {
    if (!currentToken) return;
    syncBtnText.textContent = "SYNCING...";
    syncAppBtn.disabled = true;
    syncBanner.style.display = "none";

    try {
      const res = await fetch("http://127.0.0.1:1422/api/po-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: currentToken,
          source: "extension_manual_sync",
        }),
      });

      if (res.ok) {
        syncBanner.className = "sync-banner success";
        syncBanner.textContent = "✓ Successfully synced to ViveStream!";
        syncBanner.style.display = "block";
        checkDesktopAppStatus();
      } else {
        throw new Error(`Server status ${res.status}`);
      }
    } catch (err) {
      syncBanner.className = "sync-banner error";
      syncBanner.textContent =
        "ViveStream app not detected on 127.0.0.1:1422. (Make sure ViveStream is open or paste manually into Settings!)";
      syncBanner.style.display = "block";
      checkDesktopAppStatus();
    } finally {
      syncBtnText.textContent = "SYNC TO APP";
      syncAppBtn.disabled = false;
    }
  });

  // Build Comprehensive Diagnostic Report
  async function generateDiagnosticReport() {
    const data = await chrome.storage.local.get([
      "latestPoToken",
      "activityLogs",
      "lastDiagnostics",
      "lastMediaChunkDiag",
    ]);

    let activeTab = null;
    try {
      const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
      activeTab = t;
    } catch (_) {}

    const token = data?.latestPoToken;
    const diag = data?.lastDiagnostics || {};
    const mediaDiag = data?.lastMediaChunkDiag || {};
    const logs = data?.activityLogs || [];

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const lines = [
      "======================================================================",
      "           VIVESTREAM PO TOKEN COMPANION - DIAGNOSTIC REPORT",
      "======================================================================",
      `Report Generated:  ${dateStr}`,
      `Extension Version: 1.1.0`,
      "",
      "----------------------------------------------------------------------",
      "[1. PO TOKEN STATUS]",
      "----------------------------------------------------------------------",
      `Token Captured:    ${token?.token ? "YES" : "NO"}`,
      `Token Length:      ${token?.token ? `${token.token.length} characters` : "N/A"}`,
      `Token Preview:     ${token?.token ? `${token.token.slice(0, 16)}...${token.token.slice(-10)}` : "None"}`,
      `Captured Video ID: ${token?.videoId || "N/A"}`,
      `Token Source:      ${token?.source || "N/A"}`,
      `Age:               ${token?.capturedAt ? formatTimeAgo(token.capturedAt) : "N/A"}`,
      `Sync Status:       ${token?.syncStatus || "N/A"}`,
      "",
      "----------------------------------------------------------------------",
      "[2. DESKTOP APP CONNECTIVITY]",
      "----------------------------------------------------------------------",
      `ViveStream (127.0.0.1:1422): ${isAppOnline ? "ONLINE (Connected)" : "OFFLINE / NOT RUNNING"}`,
      "",
      "----------------------------------------------------------------------",
      "[3. ACTIVE BROWSER TAB]",
      "----------------------------------------------------------------------",
      `Tab Title:         ${activeTab?.title || "Unknown"}`,
      `Tab URL:           ${activeTab?.url || "Unknown"}`,
      `Is YouTube:        ${activeTab?.url?.includes("youtube.com") ? "YES" : "NO"}`,
      "",
      "----------------------------------------------------------------------",
      "[4. TAB TELEMETRY & MEDIA STREAM DIAGNOSTICS]",
      "----------------------------------------------------------------------",
      `Video Playing:     ${diag.isPlaying ? "YES" : "NO"} (Position: ${diag.currentTime || 0}s / ${diag.duration || 0}s)`,
      `Video Title:       ${diag.title || "Unknown"}`,
      `Video ID:          ${diag.videoId || "N/A"}`,
      `Video Element Src: ${diag.videoSrc || "N/A"}`,
      `Movie Player Tag:  ${diag.hasMoviePlayer ? "FOUND" : "NOT FOUND"}`,
      `Player Response:   ${diag.hasPlayerResponse ? "AVAILABLE" : "NOT AVAILABLE"}`,
      `ytcfg Global:      ${diag.ytcfgPresent ? `AVAILABLE (${(diag.ytcfgKeys || []).length} keys)` : "NOT AVAILABLE"}`,
      `ytcfg Keys List:   [${(diag.ytcfgKeys || []).join(", ") || "none"}]`,
      `Visitor Data:      ${diag.visitorData || "NONE"}`,
      `Innertube PO Token:${diag.innertubePoToken ? `FOUND (${diag.innertubePoToken.length} chars)` : "NONE"}`,
      `Attest Challenge:  ${diag.attestationChallenge || "NONE"}`,
      `Window Globals:    [${(diag.windowGlobals || []).join(", ") || "none"}]`,
      `Cookies Present:   [${(diag.cookiesPresent || []).join(", ") || "none"}]`,
      `Total Resources:   ${diag.totalResources || 0}`,
      `Googlevideo Chunks:${diag.googlevideoCount || 0}`,
      `Chunk Sample URL:  ${diag.sampleGooglevideoUrl || mediaDiag.host || "None"}`,
      `Chunk Param Keys:  [${(diag.googlevideoParamKeys || []).join(", ") || "none"}]`,
      `Stats Beacons:     ${diag.statsBeaconCount || 0} beacons`,
      `Stats Param Keys:  [${(diag.statsParamKeys || []).join(", ") || "none"}]`,
      `Tracking URLs:     ${diag.trackingUrlsChecked || 0} inspected (${(diag.trackingUrlsList || []).join(", ") || "none"})`,
      "",
      "----------------------------------------------------------------------",
      `[5. RECENT ACTIVITY & DIAGNOSTIC LOGS (${logs.length} entries)]`,
      "----------------------------------------------------------------------",
    ];

    if (logs.length === 0) {
      lines.push("No logs recorded yet.");
    } else {
      for (const log of logs) {
        lines.push(`[${log.time}] [${(log.level || "info").toUpperCase()}] ${log.message}`);
      }
    }

    lines.push("======================================================================");
    lines.push("                     END OF DIAGNOSTIC REPORT");
    lines.push("======================================================================");

    return lines.join("\n");
  }

  // Copy full diagnostic report to clipboard
  async function handleCopyReport() {
    try {
      const report = await generateDiagnosticReport();

      let copied = false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(report);
          copied = true;
        } catch (_) {}
      }

      // Fallback
      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = report;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        copied = true;
      }

      // Visual feedback on both buttons
      if (copyLogsBtn) {
        copyLogsBtn.textContent = "✓ Copied!";
        copyLogsBtn.classList.add("copied");
        setTimeout(() => {
          copyLogsBtn.textContent = "📋 Copy Logs";
          copyLogsBtn.classList.remove("copied");
        }, 2500);
      }

      if (copyReportBtn) {
        copyReportBtn.textContent = "✓ REPORT COPIED TO CLIPBOARD!";
        copyReportBtn.classList.add("copied");
        setTimeout(() => {
          copyReportBtn.textContent = "📋 COPY FULL DIAGNOSTIC REPORT";
          copyReportBtn.classList.remove("copied");
        }, 2500);
      }

      await appendLog(`Diagnostic report (${report.length} chars) copied to clipboard!`, "success");
    } catch (err) {
      console.error("Failed to copy report:", err);
      if (copyReportBtn) copyReportBtn.textContent = "COPY FAILED";
    }
  }

  copyLogsBtn?.addEventListener("click", handleCopyReport);
  copyReportBtn?.addEventListener("click", handleCopyReport);

  // Clear Logs Button
  clearLogsBtn.addEventListener("click", async () => {
    await chrome.storage.local.set({ activityLogs: [] });
    renderLogs([]);
  });

  // Open YouTube Tab
  openYtBtn?.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.youtube.com" });
  });

  // Initial Data Load
  try {
    const data = await chrome.storage.local.get(["latestPoToken", "activityLogs"]);
    updateDisplay(data?.latestPoToken);
    renderLogs(data?.activityLogs);
  } catch (e) {
    console.error("Storage error:", e);
    updateDisplay(null);
  }

  checkActiveTabStatus();
  checkDesktopAppStatus();

  // Real-time Storage Listener
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.latestPoToken) updateDisplay(changes.latestPoToken.newValue);
      if (changes.activityLogs) renderLogs(changes.activityLogs.newValue);
    }
  });
});
