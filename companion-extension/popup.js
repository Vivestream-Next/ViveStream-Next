/**
 * ViveStream PO Token Companion - Popup Logic
 */
document.addEventListener("DOMContentLoaded", async () => {
  const headerStatusBadge = document.getElementById("headerStatusBadge");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");

  const tokenCard = document.getElementById("tokenCard");
  const tokenLengthBadge = document.getElementById("tokenLengthBadge");
  const tokenPreview = document.getElementById("tokenPreview");
  const toggleVisibilityBtn = document.getElementById("toggleVisibilityBtn");
  const tokenMeta = document.getElementById("tokenMeta");
  const metaAge = document.getElementById("metaAge");
  const metaVideo = document.getElementById("metaVideo");

  const copyTokenBtn = document.getElementById("copyTokenBtn");
  const copyBtnText = document.getElementById("copyBtnText");
  const syncAppBtn = document.getElementById("syncAppBtn");
  const syncBtnText = document.getElementById("syncBtnText");
  const syncBanner = document.getElementById("syncBanner");

  const emptyGuide = document.getElementById("emptyGuide");
  const openYtBtn = document.getElementById("openYtBtn");

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
    metaVideo.textContent = tokenData.videoId ? `Video: ${tokenData.videoId}` : "Global Web Token";
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
      } else {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err) {
      syncBanner.className = "sync-banner error";
      syncBanner.textContent =
        "ViveStream app not detected on 127.0.0.1:1422. (Make sure ViveStream is open or paste manually!)";
      syncBanner.style.display = "block";
    } finally {
      syncBtnText.textContent = "SYNC TO VIVESTREAM";
      syncAppBtn.disabled = false;
    }
  });

  // Open YouTube tab
  openYtBtn?.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.youtube.com" });
  });

  // Initial load from storage
  try {
    const data = await chrome.storage.local.get("latestPoToken");
    updateDisplay(data?.latestPoToken);
  } catch (e) {
    console.error("Storage error:", e);
    updateDisplay(null);
  }

  // Listen for storage changes while popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.latestPoToken) {
      updateDisplay(changes.latestPoToken.newValue);
    }
  });
});
