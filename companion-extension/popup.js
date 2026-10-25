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

  let currentToken = null;
  let isMasked = true;

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
      appIndicator.className = "diag-indicator active";
      appStatusLabel.textContent = "ViveStream: Online";
    } catch (_) {
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
        scanBtnText.textContent = "NO STREAM CHUNKS YET";
        syncBanner.className = "sync-banner error";
        syncBanner.textContent = response.warning;
        syncBanner.style.display = "block";
        setTimeout(() => {
          scanBtnText.textContent = "SCAN ACTIVE YOUTUBE TAB";
          scanTabBtn.disabled = false;
        }, 2000);
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

  // Copy to clipboard
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
