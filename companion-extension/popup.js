/**
 * ViveStream PO Token Companion - Popup Controller
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

    statusDot.className = "status-dot active";
    statusText.textContent = "TOKEN READY";

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
      } else {
        ytIndicator.className = "diag-indicator";
        ytStatusLabel.textContent = "YouTube Tab: Not open";
      }
    } catch (_) {
      ytIndicator.className = "diag-indicator";
      ytStatusLabel.textContent = "YouTube Tab: Unknown";
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

  // Scan Active Tab Button
  scanTabBtn.addEventListener("click", async () => {
    scanBtnText.textContent = "SCANNING TAB...";
    scanTabBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ action: "SCAN_ACTIVE_TAB" });
      if (response?.success) {
        scanBtnText.textContent = "TOKEN CAPTURED!";
        scanTabBtn.style.borderColor = "#00ffcc";
        scanTabBtn.style.color = "#00ffcc";
        setTimeout(() => {
          scanBtnText.textContent = "SCAN ACTIVE YOUTUBE TAB";
          scanTabBtn.disabled = false;
        }, 1500);
      } else if (response?.warning) {
        scanBtnText.textContent = "STREAM DETECTED - NO 'POT'";
        syncBanner.className = "sync-banner error";
        syncBanner.textContent = response.warning;
        syncBanner.style.display = "block";
        setTimeout(() => {
          scanBtnText.textContent = "SCAN ACTIVE YOUTUBE TAB";
          scanTabBtn.disabled = false;
        }, 2500);
      } else {
        scanBtnText.textContent = "SCAN FAILED";
        syncBanner.className = "sync-banner error";
        syncBanner.textContent = response?.error || "Make sure a YouTube tab is open and playing!";
        syncBanner.style.display = "block";
        setTimeout(() => {
          scanBtnText.textContent = "SCAN ACTIVE YOUTUBE TAB";
          scanTabBtn.disabled = false;
        }, 2000);
      }
    } catch (err) {
      scanBtnText.textContent = "SCAN ERROR";
      setTimeout(() => {
        scanBtnText.textContent = "SCAN ACTIVE YOUTUBE TAB";
        scanTabBtn.disabled = false;
      }, 1500);
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
      `Report Generated: ${dateStr}`,
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
      `Movie Player Tag:  ${diag.hasMoviePlayer ? "FOUND" : "NOT FOUND"}`,
      `Player Response:   ${diag.hasPlayerResponse ? "AVAILABLE" : "NOT AVAILABLE"}`,
      `ytcfg Global:      ${diag.ytcfgPresent ? "AVAILABLE" : "NOT AVAILABLE"}`,
      `Visitor Data:      ${diag.visitorData ? "FOUND" : "NONE"}`,
      `Resources Total:   ${diag.totalResources || 0}`,
      `Googlevideo Chunks:${diag.googlevideoCount || 0}`,
      `Chunk Param Keys:  [${(diag.googlevideoParamKeys || []).join(", ") || "none"}]`,
      `Tracking URLs:     ${diag.trackingUrlsChecked || 0} inspected`,
      `Recent Media Chunk:${mediaDiag.host ? `${mediaDiag.host}${mediaDiag.pathname} (params: ${(mediaDiag.paramKeys || []).slice(0, 8).join(", ")})` : "None"}`,
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

      chrome.runtime.sendMessage({
        action: "ADD_LOG",
        message: `Diagnostic report (${report.length} chars) copied to clipboard. Ready to paste!`,
        level: "success",
      });
    } catch (err) {
      console.error("Failed to copy report:", err);
      if (copyReportBtn) copyReportBtn.textContent = "COPY FAILED";
    }
  }

  copyLogsBtn?.addEventListener("click", handleCopyReport);
  copyReportBtn?.addEventListener("click", handleCopyReport);

  // Clear Logs Button
  clearLogsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "CLEAR_LOGS" });
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
